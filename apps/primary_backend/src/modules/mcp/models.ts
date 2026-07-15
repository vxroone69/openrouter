import { t } from "elysia";

export namespace McpModel {
    const jsonRecord = t.Record(t.String(), t.Any());

    export const createServerSchema = t.Object({
        name: t.String({ minLength: 1 }),
        command: t.String({ minLength: 1 }),
        args: t.Optional(t.Array(t.String())),
        env: t.Optional(t.Record(t.String(), t.String())),
    });

    export const updateServerSchema = t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        command: t.Optional(t.String({ minLength: 1 })),
        args: t.Optional(t.Array(t.String())),
        env: t.Optional(t.Record(t.String(), t.String())),
        enabled: t.Optional(t.Boolean()),
    });

    export const setApiKeyToolSchema = t.Object({
        enabled: t.Boolean(),
    });

    export const callToolSchema = t.Object({
        apiKeyId: t.Optional(t.String()),
        input: t.Optional(t.Any()),
    });

    const toolLinkSchema = t.Object({
        id: t.String(),
        apiKeyId: t.String(),
        toolId: t.String(),
        enabled: t.Boolean(),
    });

    const toolSchema = t.Object({
        id: t.String(),
        serverId: t.String(),
        name: t.String(),
        description: t.Nullable(t.String()),
        inputSchema: t.Nullable(t.Any()),
        enabled: t.Boolean(),
        lastSeenAt: t.Nullable(t.String()),
        createdAt: t.String(),
        updatedAt: t.String(),
        apiKeyLinks: t.Array(toolLinkSchema),
    });

    const serverSchema = t.Object({
        id: t.String(),
        name: t.String(),
        command: t.String(),
        args: t.Array(t.String()),
        env: t.Record(t.String(), t.String()),
        enabled: t.Boolean(),
        lastDiscoveredAt: t.Nullable(t.String()),
        createdAt: t.String(),
        updatedAt: t.String(),
        tools: t.Array(toolSchema),
    });

    const executionSchema = t.Object({
        id: t.String(),
        userId: t.String(),
        apiKeyId: t.Nullable(t.String()),
        serverId: t.String(),
        toolId: t.Nullable(t.String()),
        toolName: t.String(),
        status: t.Union([t.Literal("success"), t.Literal("error")]),
        input: t.Nullable(t.Any()),
        output: t.Nullable(t.Any()),
        error: t.Nullable(t.String()),
        latencyMs: t.Number(),
        createdAt: t.String(),
    });

    export const listResponseSchema = t.Object({
        servers: t.Array(serverSchema),
        executions: t.Array(executionSchema),
    });

    export const serverResponseSchema = serverSchema;

    export const apiKeyToolsResponseSchema = t.Object({
        tools: t.Array(t.Intersect([
            toolSchema,
            t.Object({
                serverName: t.String(),
                allowed: t.Boolean(),
            }),
        ])),
    });

    export const setApiKeyToolResponseSchema = toolLinkSchema;

    export const callToolResponseSchema = t.Object({
        execution: executionSchema,
        output: t.Any(),
    });

    export const errorResponseSchema = t.Object({
        message: t.String(),
        execution: t.Optional(t.Any()),
    });
}
