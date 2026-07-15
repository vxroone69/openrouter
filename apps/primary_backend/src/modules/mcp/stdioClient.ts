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

export type McpToolDescription = {
    name: string;
    description: string | null;
    inputSchema: unknown;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseMessageLine(line: string): JsonRpcResponse | null {
    try {
        const parsed = JSON.parse(line);
        return asRecord(parsed) as JsonRpcResponse;
    } catch {
        return null;
    }
}

export class McpStdioClient {
    static async discoverTools(server: McpServerCommand): Promise<McpToolDescription[]> {
        const result = await this.request(server, "tools/list", {});
        const rawTools = asRecord(result).tools;
        const tools: unknown[] = Array.isArray(rawTools) ? rawTools : [];

        return tools.map((tool): McpToolDescription => {
            const row = asRecord(tool);
            return {
                name: String(row.name ?? ""),
                description: typeof row.description === "string" ? row.description : null,
                inputSchema: row.inputSchema ?? null,
            };
        }).filter((tool: McpToolDescription) => tool.name.length > 0);
    }

    static async callTool(server: McpServerCommand, name: string, args: unknown) {
        return this.request(server, "tools/call", {
            name,
            arguments: args && typeof args === "object" ? args : {},
        });
    }

    private static async request(server: McpServerCommand, method: string, params: unknown) {
        const proc = Bun.spawn([server.command, ...server.args], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            env: {
                ...process.env,
                ...server.env,
            },
        });

        const reader = proc.stdout.getReader();
        const stderrReader = proc.stderr.getReader();
        const errors: string[] = [];
        void (async () => {
            while (true) {
                const chunk = await stderrReader.read();
                if (chunk.done) break;
                errors.push(decoder.decode(chunk.value));
            }
        })();

        let nextId = 1;
        const send = async (payload: Record<string, unknown>) => {
            proc.stdin.write(encoder.encode(`${JSON.stringify(payload)}\n`));
            await proc.stdin.flush();
        };

        const waitFor = async (id: number) => {
            const timeoutAt = Date.now() + 15_000;
            let buffer = "";

            while (Date.now() < timeoutAt) {
                const chunk = await reader.read();
                if (chunk.done) break;

                buffer += decoder.decode(chunk.value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const response = parseMessageLine(trimmed);
                    if (!response || response.id !== id) continue;
                    if (response.error) {
                        throw new Error(response.error.message || "MCP server returned an error");
                    }
                    return response.result;
                }
            }

            throw new Error(errors.join("").trim() || "Timed out waiting for MCP server response");
        };

        try {
            const initializeId = nextId++;
            await send({
                jsonrpc: "2.0",
                id: initializeId,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: "synapse",
                        version: "0.1.0",
                    },
                },
            });
            await waitFor(initializeId);

            await send({
                jsonrpc: "2.0",
                method: "notifications/initialized",
                params: {},
            });

            const requestId = nextId++;
            await send({
                jsonrpc: "2.0",
                id: requestId,
                method,
                params,
            });

            return await waitFor(requestId);
        } finally {
            try {
                proc.stdin.end();
            } catch {
                // Process may have already exited.
            }
            proc.kill();
        }
    }
}
