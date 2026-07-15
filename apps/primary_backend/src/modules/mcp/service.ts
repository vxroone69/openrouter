import { prisma } from "db";
import { McpStdioClient } from "./stdioClient";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { generateMemoryEmbedding, toPgVector } from "../memory/embedding";

type CreateServerInput = {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
};

type UpdateServerInput = Partial<CreateServerInput> & {
    enabled?: boolean;
};

function parseJsonArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

function parseJsonEnv(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const env: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === "string") env[key] = raw;
    }
    return env;
}

function maskEnv(value: unknown): Record<string, string> {
    const env = parseJsonEnv(value);
    return Object.fromEntries(Object.keys(env).map((key) => [key, "********"]));
}

function formatServer(server: any) {
    return {
        id: String(server.id),
        name: server.name,
        command: server.command,
        args: parseJsonArray(server.args),
        env: maskEnv(server.env),
        enabled: server.enabled,
        lastDiscoveredAt: server.lastDiscoveredAt?.toISOString() ?? null,
        createdAt: server.createdAt.toISOString(),
        updatedAt: server.updatedAt.toISOString(),
        tools: (server.tools ?? []).map(formatTool),
    };
}

function formatTool(tool: any) {
    return {
        id: String(tool.id),
        serverId: String(tool.serverId),
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema ?? null,
        enabled: tool.enabled,
        lastSeenAt: tool.lastSeenAt?.toISOString() ?? null,
        createdAt: tool.createdAt.toISOString(),
        updatedAt: tool.updatedAt.toISOString(),
        apiKeyLinks: (tool.apiKeyLinks ?? []).map((link: any) => ({
            id: String(link.id),
            apiKeyId: String(link.apiKeyId),
            toolId: String(link.toolId),
            enabled: link.enabled,
        })),
    };
}

function formatExecution(execution: any) {
    return {
        id: String(execution.id),
        userId: String(execution.userId),
        apiKeyId: execution.apiKeyId == null ? null : String(execution.apiKeyId),
        serverId: String(execution.serverId),
        toolId: execution.toolId == null ? null : String(execution.toolId),
        toolName: execution.toolName,
        status: execution.status,
        input: execution.input ?? null,
        output: execution.output ?? null,
        error: execution.error ?? null,
        latencyMs: execution.latencyMs,
        createdAt: execution.createdAt.toISOString(),
    };
}

function isFilesystemMcpServer(command: string, args: string[]) {
    return command === "npx" && args.includes("@modelcontextprotocol/server-filesystem");
}

function filesystemAllowedDirectories(args: string[]) {
    const packageIndex = args.findIndex((arg) => arg === "@modelcontextprotocol/server-filesystem");
    if (packageIndex === -1) return [];

    return args
        .slice(packageIndex + 1)
        .filter((arg) => !arg.startsWith("-"))
        .map((dir) => path.resolve(dir));
}

function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveAllowedPath(rawPath: unknown, allowedDirectories: string[]) {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
        throw new Error("A path string is required");
    }

    const resolved = path.resolve(rawPath);
    const isAllowed = allowedDirectories.some((allowed) => {
        const relative = path.relative(allowed, resolved);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });

    if (!isAllowed) {
        throw new Error(`Path is outside allowed directories: ${resolved}`);
    }

    return resolved;
}

function textContent(text: string) {
    return {
        content: [
            {
                type: "text",
                text,
            },
        ],
    };
}

function buildToolEmbeddingText(input: {
    serverName: string;
    toolName: string;
    description: string | null;
    inputSchema: unknown;
}) {
    return [
        `MCP server: ${input.serverName}`,
        `Tool: ${input.toolName}`,
        `Description: ${input.description ?? "No description"}`,
        `Input schema: ${JSON.stringify(input.inputSchema ?? {})}`,
    ].join("\n");
}

async function refreshToolEmbedding(toolId: number, text: string) {
    try {
        const embedding = await generateMemoryEmbedding(text);
        if (!embedding) return;

        await prisma.$executeRawUnsafe(`
            UPDATE "McpTool"
            SET "embedding" = '${toPgVector(embedding)}'::vector
            WHERE "id" = ${toolId}
        `);
    } catch (error) {
        console.error("Failed to persist MCP tool embedding:", error);
    }
}

async function directoryTree(dir: string): Promise<{ name: string; type: "file" | "directory"; children?: unknown[] }> {
    const entryStat = await stat(dir);
    const name = path.basename(dir) || dir;

    if (!entryStat.isDirectory()) {
        return {
            name,
            type: "file",
        };
    }

    const entries = await readdir(dir, { withFileTypes: true });
    const children = await Promise.all(
        entries.map((entry) => directoryTree(path.join(dir, entry.name)))
    );

    return {
        name,
        type: "directory",
        children,
    };
}

async function callFilesystemFallback(command: string, args: string[], toolName: string, input: unknown) {
    if (!isFilesystemMcpServer(command, args)) return null;

    const allowedDirectories = filesystemAllowedDirectories(args);
    if (allowedDirectories.length === 0) {
        throw new Error("Filesystem MCP server has no allowed directories configured");
    }

    const body = asObject(input);

    if (toolName === "list_allowed_directories") {
        return textContent(`Allowed directories:\n${allowedDirectories.join("\n")}`);
    }

    if (toolName === "list_directory" || toolName === "list_directory_with_sizes") {
        const dir = resolveAllowedPath(body.path, allowedDirectories);
        const entries = await readdir(dir, { withFileTypes: true });
        const lines = await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            const prefix = entry.isDirectory() ? "[DIR]" : "[FILE]";
            if (toolName !== "list_directory_with_sizes" || entry.isDirectory()) {
                return `${prefix} ${entry.name}`;
            }
            const fileStat = await stat(fullPath);
            return `${prefix} ${entry.name} (${fileStat.size} bytes)`;
        }));

        return textContent(lines.join("\n"));
    }

    if (toolName === "get_file_info") {
        const target = resolveAllowedPath(body.path, allowedDirectories);
        const info = await stat(target);
        return textContent(JSON.stringify({
            path: target,
            size: info.size,
            type: info.isDirectory() ? "directory" : "file",
            created: info.birthtime.toISOString(),
            modified: info.mtime.toISOString(),
            accessed: info.atime.toISOString(),
            mode: info.mode,
        }, null, 2));
    }

    if (toolName === "read_text_file" || toolName === "read_file") {
        const target = resolveAllowedPath(body.path, allowedDirectories);
        const content = await readFile(target, "utf8");
        const head = typeof body.head === "number" ? body.head : null;
        const tail = typeof body.tail === "number" ? body.tail : null;
        const lines = content.split(/\r?\n/);

        if (head != null) return textContent(lines.slice(0, head).join("\n"));
        if (tail != null) return textContent(lines.slice(-tail).join("\n"));
        return textContent(content);
    }

    if (toolName === "directory_tree") {
        const dir = resolveAllowedPath(body.path, allowedDirectories);
        return textContent(JSON.stringify(await directoryTree(dir), null, 2));
    }

    return null;
}

export class McpService {
    static async list(userId: number) {
        const [servers, executions] = await Promise.all([
            prisma.mcpServer.findMany({
                where: { userId },
                include: {
                    tools: {
                        orderBy: { name: "asc" },
                        include: {
                            apiKeyLinks: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            }),
            prisma.mcpToolExecution.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                take: 10,
            }),
        ]);

        return {
            servers: servers.map(formatServer),
            executions: executions.map(formatExecution),
        };
    }

    static async createServer(userId: number, input: CreateServerInput) {
        const server = await prisma.mcpServer.create({
            data: {
                userId,
                name: input.name,
                command: input.command,
                args: input.args ?? [],
                env: input.env ?? {},
            },
            include: {
                tools: {
                    include: {
                        apiKeyLinks: true,
                    },
                },
            },
        });

        return formatServer(server);
    }

    static async updateServer(userId: number, serverId: number, input: UpdateServerInput) {
        await McpStdioClient.stopSession(String(serverId));

        const server = await prisma.mcpServer.update({
            where: {
                id: serverId,
                userId,
            },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.command !== undefined ? { command: input.command } : {}),
                ...(input.args !== undefined ? { args: input.args } : {}),
                ...(input.env !== undefined ? { env: input.env } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            },
            include: {
                tools: {
                    include: {
                        apiKeyLinks: true,
                    },
                },
            },
        });

        return formatServer(server);
    }

    static async deleteServer(userId: number, serverId: number) {
        await McpStdioClient.stopSession(String(serverId));

        await prisma.mcpServer.delete({
            where: {
                id: serverId,
                userId,
            },
        });
    }

    static async discoverTools(userId: number, serverId: number) {
        const server = await prisma.mcpServer.findFirstOrThrow({
            where: {
                id: serverId,
                userId,
                enabled: true,
            },
        });

        const tools = await McpStdioClient.discoverTools(String(server.id), {
            command: server.command,
            args: parseJsonArray(server.args),
            env: parseJsonEnv(server.env),
        });

        const savedTools = await prisma.$transaction([
            ...tools.map((tool) =>
                prisma.mcpTool.upsert({
                    where: {
                        serverId_name: {
                            serverId,
                            name: tool.name,
                        },
                    },
                    create: {
                        serverId,
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema as any,
                    },
                    update: {
                        description: tool.description,
                        inputSchema: tool.inputSchema as any,
                        enabled: true,
                        lastSeenAt: new Date(),
                    },
                })
            ),
            prisma.mcpServer.update({
                where: { id: serverId },
                data: { lastDiscoveredAt: new Date() },
            }),
        ]);

        void Promise.all(
            savedTools
                .filter((tool): tool is typeof tool & { id: number; name: string; serverId: number; description: string | null; inputSchema: unknown } => "serverId" in tool)
                .map((tool) =>
                    refreshToolEmbedding(
                        tool.id,
                        buildToolEmbeddingText({
                            serverName: server.name,
                            toolName: tool.name,
                            description: tool.description,
                            inputSchema: tool.inputSchema,
                        })
                    )
                )
        ).catch((error) => {
            console.error("Failed to refresh MCP tool embeddings:", error);
        });

        const refreshed = await prisma.mcpServer.findFirstOrThrow({
            where: {
                id: serverId,
                userId,
            },
            include: {
                tools: {
                    orderBy: { name: "asc" },
                    include: {
                        apiKeyLinks: true,
                    },
                },
            },
        });

        return formatServer(refreshed);
    }

    static async listApiKeyTools(userId: number, apiKeyId: number) {
        await prisma.apiKey.findFirstOrThrow({
            where: {
                id: apiKeyId,
                userId,
                deleted: false,
            },
        });

        const tools = await prisma.mcpTool.findMany({
            where: {
                server: {
                    userId,
                    enabled: true,
                },
                enabled: true,
            },
            include: {
                server: true,
                apiKeyLinks: {
                    where: { apiKeyId },
                },
            },
            orderBy: [
                { serverId: "asc" },
                { name: "asc" },
            ],
        });

        return tools.map((tool) => ({
            ...formatTool(tool),
            serverName: tool.server.name,
            allowed: tool.apiKeyLinks[0]?.enabled ?? false,
        }));
    }

    static async setApiKeyTool(userId: number, apiKeyId: number, toolId: number, enabled: boolean) {
        const tool = await prisma.mcpTool.findFirstOrThrow({
            where: {
                id: toolId,
                server: {
                    userId,
                },
            },
        });

        await prisma.apiKey.findFirstOrThrow({
            where: {
                id: apiKeyId,
                userId,
                deleted: false,
            },
        });

        const link = await prisma.mcpApiKeyTool.upsert({
            where: {
                apiKeyId_toolId: {
                    apiKeyId,
                    toolId: tool.id,
                },
            },
            create: {
                apiKeyId,
                toolId,
                enabled,
            },
            update: {
                enabled,
            },
        });

        return {
            id: String(link.id),
            apiKeyId: String(link.apiKeyId),
            toolId: String(link.toolId),
            enabled: link.enabled,
        };
    }

    static async callTool(userId: number, toolId: number, input: unknown, apiKeyId?: number) {
        const tool = await prisma.mcpTool.findFirstOrThrow({
            where: {
                id: toolId,
                enabled: true,
                server: {
                    userId,
                    enabled: true,
                },
            },
            include: {
                server: true,
                apiKeyLinks: apiKeyId ? {
                    where: {
                        apiKeyId,
                        enabled: true,
                    },
                } : false,
            },
        });

        if (apiKeyId) {
            await prisma.apiKey.findFirstOrThrow({
                where: {
                    id: apiKeyId,
                    userId,
                    deleted: false,
                },
            });

            if (tool.apiKeyLinks.length === 0) {
                throw new Error("Tool is not enabled for this API key");
            }
        }

        const startedAt = Date.now();
        try {
            const serverArgs = parseJsonArray(tool.server.args);
            const output = await callFilesystemFallback(
                tool.server.command,
                serverArgs,
                tool.name,
                input
            ) ?? await McpStdioClient.callTool(String(tool.serverId), {
                command: tool.server.command,
                args: serverArgs,
                env: parseJsonEnv(tool.server.env),
            }, tool.name, input);

            const execution = await prisma.mcpToolExecution.create({
                data: {
                    userId,
                    apiKeyId,
                    serverId: tool.serverId,
                    toolId: tool.id,
                    toolName: tool.name,
                    status: "success",
                    input: input as any,
                    output: output as any,
                    latencyMs: Date.now() - startedAt,
                },
            });

            return {
                execution: formatExecution(execution),
                output,
            };
        } catch (error) {
            const execution = await prisma.mcpToolExecution.create({
                data: {
                    userId,
                    apiKeyId,
                    serverId: tool.serverId,
                    toolId: tool.id,
                    toolName: tool.name,
                    status: "error",
                    input: input as any,
                    error: error instanceof Error ? error.message : "Failed to call MCP tool",
                    latencyMs: Date.now() - startedAt,
                },
            });

            throw Object.assign(new Error(execution.error ?? "Failed to call MCP tool"), {
                execution: formatExecution(execution),
            });
        }
    }
}
