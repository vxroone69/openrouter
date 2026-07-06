// apps/api_backend/src/streaming/chatStream.ts
const encoder = new TextEncoder();

type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function splitTextIntoChunks(text: string, chunkCount = 24) {
  const characters = Array.from(text);

  if (characters.length === 0) {
    return [""];
  }

  const size = Math.max(1, Math.ceil(characters.length / chunkCount));
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += size) {
    chunks.push(characters.slice(index, index + size).join(""));
  }

  return chunks;
}

function createChunk({
  id,
  model,
  created,
  delta,
  finishReason = null,
  usage,
}: {
  id: string;
  model: string;
  created: number;
  delta: {
    role?: "assistant";
    content?: string;
  };
  finishReason?: "stop" | null;
  usage?: StreamUsage;
}) {
  const payload: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };

  if (usage) {
    payload.usage = {
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
    };
  }

  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createChatCompletionStream({
  model,
  text,
  usage,
  chunkDelayMs = 20,
}: {
  model: string;
  text: string;
  usage: StreamUsage;
  chunkDelayMs?: number;
}) {
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunks = splitTextIntoChunks(text, 24);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      (async () => {
        controller.enqueue(
          encoder.encode(
            createChunk({
              id,
              model,
              created,
              delta: { role: "assistant" },
            })
          )
        );

        for (const chunk of chunks) {
          controller.enqueue(
            encoder.encode(
              createChunk({
                id,
                model,
                created,
                delta: { content: chunk },
              })
            )
          );

          if (chunkDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
          }
        }

        controller.enqueue(
          encoder.encode(
            createChunk({
              id,
              model,
              created,
              delta: {},
              finishReason: "stop",
              usage,
            })
          )
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      })().catch((error) => controller.error(error));
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}