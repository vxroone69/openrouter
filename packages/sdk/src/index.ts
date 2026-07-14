export type SynapseRole = "user" | "assistant";

export type SynapseMessage = {
  role: SynapseRole;
  content: string;
};

export type SynapseMemoryMode = "none" | "user" | "api_key";

export type SynapseClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type ChatCompletionCreateParams = {
  model: string;
  messages: SynapseMessage[];
  stream?: boolean;
  memory?: SynapseMemoryMode;
  memoryLimit?: number;
  memoryTokenBudget?: number;
};

export type ChatCompletionStreamParams = Omit<ChatCompletionCreateParams, "stream"> & {
  stream: true;
};

export type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: "stop" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type ModelPlan = "free" | "pro";

export type SynapseModel = {
  id: string;
  name: string;
  slug: string;
  minPlan: ModelPlan;
  company: {
    id: string;
    name: string;
    website: string;
  };
};

export class SynapseError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SynapseError";
    this.status = status;
    this.body = body;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildGatewayUrl(baseUrl: string, params: Pick<ChatCompletionCreateParams, "memory" | "memoryLimit" | "memoryTokenBudget">) {
  const url = new URL("/api/v1/chat/completions", `${normalizeBaseUrl(baseUrl)}/`);

  if (params.memory) {
    url.searchParams.set("memory", params.memory);
  }

  if (params.memoryLimit != null) {
    url.searchParams.set("memoryLimit", String(params.memoryLimit));
  }

  if (params.memoryTokenBudget != null) {
    url.searchParams.set("memoryTokenBudget", String(params.memoryTokenBudget));
  }

  return url;
}

function parseSseData(rawEvent: string) {
  return rawEvent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

async function parseError(response: Response) {
  const raw = await response.text();

  if (!raw) {
    return { message: `Synapse request failed with status ${response.status}`, body: null };
  }

  try {
    const body = JSON.parse(raw) as { message?: string };
    return {
      message: body.message ?? raw,
      body,
    };
  } catch {
    return {
      message: raw,
      body: raw,
    };
  }
}

export class Synapse {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SynapseClientOptions) {
    if (!options.apiKey) {
      throw new Error("Synapse apiKey is required");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "http://localhost:3002";
    this.fetchImpl = options.fetch ?? fetch;
  }

  chat = {
    completions: {
      create: async (params: ChatCompletionCreateParams): Promise<unknown | AsyncIterable<ChatCompletionChunk>> => {
        if (params.stream) {
          return this.streamCompletion({ ...params, stream: true });
        }

        return this.createCompletion(params);
      },
      stream: async (params: Omit<ChatCompletionStreamParams, "stream">): Promise<AsyncIterable<ChatCompletionChunk>> => {
        return this.streamCompletion({ ...params, stream: true });
      },
    },
  };

  models = {
    list: async (): Promise<SynapseModel[]> => {
      const response = await this.fetchImpl(`${normalizeBaseUrl(this.baseUrl)}/models`);

      if (!response.ok) {
        const error = await parseError(response);
        throw new SynapseError(error.message, response.status, error.body);
      }

      const body = (await response.json()) as { models: SynapseModel[] };
      return body.models;
    },
  };

  async createCompletion(params: ChatCompletionCreateParams): Promise<unknown> {
    const url = buildGatewayUrl(this.baseUrl, params);
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
      }),
    });

    if (!response.ok) {
      const error = await parseError(response);
      throw new SynapseError(error.message, response.status, error.body);
    }

    return response.json();
  }

  async streamCompletion(params: ChatCompletionStreamParams): Promise<AsyncIterable<ChatCompletionChunk>> {
    const url = buildGatewayUrl(this.baseUrl, params);
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        stream: true,
        messages: params.messages,
      }),
    });

    if (!response.ok) {
      const error = await parseError(response);
      throw new SynapseError(error.message, response.status, error.body);
    }

    if (!response.body) {
      throw new SynapseError("Synapse stream response body is unavailable", response.status, null);
    }

    return this.parseCompletionStream(response.body);
  }

  private async *parseCompletionStream(body: ReadableStream<Uint8Array>): AsyncIterable<ChatCompletionChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const data = parseSseData(rawEvent);
        if (data === "[DONE]") {
          return;
        }

        if (data) {
          yield JSON.parse(data) as ChatCompletionChunk;
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }
    }

    const tailData = parseSseData(buffer);
    if (tailData && tailData !== "[DONE]") {
      yield JSON.parse(tailData) as ChatCompletionChunk;
    }
  }
}
