import { t } from "elysia";

export namespace MemoryModel {
    const scopeSchema = t.Union([
        t.Literal("conversation"),
        t.Literal("user"),
        t.Literal("project"),
        t.Literal("semantic"),
    ]);

    const memorySchema = t.Object({
        id: t.String(),
        userId: t.String(),
        apiKeyId: t.Nullable(t.String()),
        scope: scopeSchema,
        content: t.String(),
        source: t.Nullable(t.String()),
        confidence: t.Number(),
        importance: t.Number(),
        enabled: t.Boolean(),
        archived: t.Boolean(),
        createdAt: t.String(),
        updatedAt: t.String(),
        lastUsedAt: t.Nullable(t.String()),
    });

    export const createMemorySchema = t.Object({
        content: t.String({ minLength: 1 }),
        scope: t.Optional(scopeSchema),
        source: t.Optional(t.String()),
        confidence: t.Optional(t.Number()),
        importance: t.Optional(t.Number()),
        apiKeyId: t.Optional(t.String()),
    });

    export const listMemoriesQuerySchema = t.Object({
        apiKeyId: t.Optional(t.String()),
        scope: t.Optional(t.Union([
            t.Literal("user"),
            t.Literal("api_key"),
        ])),
    });

    export const updateMemorySchema = t.Object({
        id: t.String(),
        content: t.Optional(t.String({ minLength: 1 })),
        scope: t.Optional(scopeSchema),
        source: t.Optional(t.String()),
        confidence: t.Optional(t.Number()),
        importance: t.Optional(t.Number()),
        enabled: t.Optional(t.Boolean()),
        archived: t.Optional(t.Boolean()),
    });

    export const getMemoriesResponseSchema = t.Object({
        memories: t.Array(memorySchema),
    });

    export const createMemoryResponseSchema = memorySchema;

    export const updateMemoryResponseSchema = memorySchema;

    export const deleteMemoryResponseSchema = t.Object({
        message: t.Literal("Memory deleted successfully"),
    });
}
