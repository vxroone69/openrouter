type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export type McpServerCommand = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: Timer;
};

type McpProcess = ReturnType<typeof Bun.spawn> & {
  stdin: Bun.FileSink;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MCP_REQUEST_TIMEOUT_MS = Number(process.env.MCP_REQUEST_TIMEOUT_MS ?? 60_000);
const MCP_SESSION_IDLE_MS = Number(process.env.MCP_SESSION_IDLE_MS ?? 10 * 60_000);
const HEADER_SEPARATOR = encoder.encode("\r\n\r\n");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonLine(line: string): JsonRpcResponse | null {
  try {
    return JSON.parse(line) as JsonRpcResponse;
  } catch {
    return null;
  }
}

function concatBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>) {
  const next = new Uint8Array(left.length + right.length);
  next.set(left);
  next.set(right, left.length);
  return next;
}

function indexOfBytes(haystack: Uint8Array<ArrayBufferLike>, needle: Uint8Array<ArrayBufferLike>) {
  outer:
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseFramedMessage(buffer: Uint8Array<ArrayBufferLike>): { message: JsonRpcResponse; rest: Uint8Array<ArrayBufferLike> } | null {
  const headerEnd = indexOfBytes(buffer, HEADER_SEPARATOR);
  if (headerEnd === -1) return null;

  const header = decoder.decode(buffer.slice(0, headerEnd));
  const contentLengthLine = header
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().startsWith("content-length:"));
  const contentLength = Number(contentLengthLine?.split(":")[1]?.trim());
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new Error("MCP server returned an invalid Content-Length header");
  }

  const bodyStart = headerEnd + HEADER_SEPARATOR.length;
  const bodyEnd = bodyStart + contentLength;
  if (buffer.length < bodyEnd) return null;

  const body = decoder.decode(buffer.slice(bodyStart, bodyEnd));
  return {
    message: JSON.parse(body) as JsonRpcResponse,
    rest: buffer.slice(bodyEnd),
  };
}

function formatCommand(server: McpServerCommand) {
  return `${server.command} ${server.args.join(" ")}`.trim();
}

class McpStdioSession {
  private proc: McpProcess | null = null;
  private stdoutBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private stdoutTextBuffer = "";
  private nextId = 1;
  private initialized = false;
  private startPromise: Promise<void> | null = null;
  private idleTimer: Timer | null = null;
  private stderrTail = "";
  private pending = new Map<number, PendingRequest>();

  constructor(
    private readonly sessionKey: string,
    private readonly server: McpServerCommand,
    private readonly onClose: (sessionKey: string, session: McpStdioSession) => void
  ) {}

  async callTool(name: string, args: unknown) {
    return this.request("tools/call", {
      name,
      arguments: args && typeof args === "object" ? args : {},
    });
  }

  async stop() {
    this.clearIdleTimer();
    this.rejectAll(new Error("MCP session stopped"));
    const proc = this.proc;
    this.proc = null;
    this.initialized = false;
    this.startPromise = null;

    if (!proc) return;

    try {
      proc.stdin.end();
    } catch {
      // Process may already be closed.
    }

    try {
      proc.kill();
    } catch {
      // Process may already be closed.
    }
  }

  private async request(method: string, params: unknown) {
    await this.ensureStarted();
    this.bumpIdleTimer();

    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(
          this.stderrTail ||
          `Timed out waiting for MCP server response from "${formatCommand(this.server)}"`
        ));
      }, MCP_REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    try {
      this.send(payload);
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(id);
      }
      throw error;
    }

    return promise;
  }

  private async ensureStarted() {
    if (this.initialized && this.proc) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.start();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start() {
    this.proc = Bun.spawn([this.server.command, ...this.server.args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...this.server.env,
      },
    }) as McpProcess;
    this.stdoutBuffer = new Uint8Array();
    this.stdoutTextBuffer = "";
    this.stderrTail = "";
    this.nextId = 1;
    this.initialized = false;

    this.readStdout(this.proc);
    this.readStderr(this.proc);
    this.watchExit(this.proc);

    await this.initialize();
    this.initialized = true;
    this.bumpIdleTimer();
  }

  private async initialize() {
    await this.requestRaw("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "synapse-api-gateway",
        version: "0.1.0",
      },
    });

    this.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
  }

  private requestRaw(method: string, params: unknown) {
    if (!this.proc) {
      throw new Error("MCP session is not running");
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(
          this.stderrTail ||
          `Timed out waiting for MCP server response from "${formatCommand(this.server)}"`
        ));
      }, MCP_REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    this.send(payload);
    return promise;
  }

  private send(payload: Record<string, unknown>) {
    const proc = this.proc;
    if (!proc) {
      throw new Error("MCP session is not running");
    }

    const body = JSON.stringify(payload);
    proc.stdin.write(encoder.encode(`${body}\n`));
    void proc.stdin.flush();
  }

  private async readStdout(proc: McpProcess) {
    const reader = proc.stdout.getReader();

    try {
      while (this.proc === proc) {
        const chunk = await reader.read();
        if (chunk.done) break;

        this.stdoutBuffer = concatBytes(this.stdoutBuffer, chunk.value);
        this.stdoutTextBuffer += decoder.decode(chunk.value, { stream: true });

        while (true) {
          const parsed = parseFramedMessage(this.stdoutBuffer);
          if (!parsed) break;

          this.stdoutBuffer = parsed.rest;
          this.handleMessage(parsed.message);
        }

        const lines = this.stdoutTextBuffer.split(/\r?\n/);
        this.stdoutTextBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parsed = parseJsonLine(trimmed);
          if (!parsed) continue;
          this.stdoutBuffer = new Uint8Array();
          this.handleMessage(parsed);
        }
      }
    } catch (error) {
      this.closeWithError(error instanceof Error ? error : new Error("Failed reading MCP stdout"));
    }
  }

  private async readStderr(proc: McpProcess) {
    const reader = proc.stderr.getReader();

    try {
      while (this.proc === proc) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.stderrTail = `${this.stderrTail}${decoder.decode(chunk.value)}`.slice(-4000).trim();
      }
    } catch {
      // The process can be killed while stderr is draining.
    }
  }

  private async watchExit(proc: McpProcess) {
    const exitCode = await proc.exited;
    if (this.proc !== proc) return;

    this.closeWithError(new Error(
      this.stderrTail ||
      `MCP server exited with code ${exitCode}`
    ));
  }

  private handleMessage(response: JsonRpcResponse) {
    if (response.id == null) return;

    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || "MCP server returned an error"));
      return;
    }

    pending.resolve(response.result);
  }

  private closeWithError(error: Error) {
    this.rejectAll(error);
    this.initialized = false;
    const proc = this.proc;
    this.proc = null;
    this.startPromise = null;
    this.clearIdleTimer();

    if (proc) {
      try {
        proc.kill();
      } catch {
        // Process may already be closed.
      }
    }

    this.onClose(this.sessionKey, this);
  }

  private rejectAll(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private bumpIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.stop();
      this.onClose(this.sessionKey, this);
    }, MCP_SESSION_IDLE_MS);
  }

  private clearIdleTimer() {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

export class McpStdioClient {
  private static sessions = new Map<string, McpStdioSession>();

  static async callTool(sessionKey: string, server: McpServerCommand, name: string, args: unknown) {
    return this.getSession(sessionKey, server).callTool(name, args);
  }

  static async stopSession(sessionKey: string) {
    const session = this.sessions.get(sessionKey);
    this.sessions.delete(sessionKey);
    await session?.stop();
  }

  private static getSession(sessionKey: string, server: McpServerCommand) {
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing;

    const session = new McpStdioSession(sessionKey, server, (key, closingSession) => {
      if (this.sessions.get(key) === closingSession) {
        this.sessions.delete(key);
      }
    });
    this.sessions.set(sessionKey, session);
    return session;
  }
}
