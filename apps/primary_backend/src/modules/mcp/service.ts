import { prisma } from "db";
import { McpStdioClient } from "./stdioClient";

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

        await prisma.$transaction([
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
            const output = await McpStdioClient.callTool(String(tool.serverId), {
                command: tool.server.command,
                args: parseJsonArray(tool.server.args),
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
