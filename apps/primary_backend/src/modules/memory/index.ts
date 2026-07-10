import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";
import { MemoryModel } from "./models";
import { MemoryService } from "./service";

export const app = new Elysia({ prefix: "memory" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
        })
    )
    .resolve(async ({ cookie: { auth }, status, jwt }) => {
        if (!auth) {
            return status(401);
        }

        const decoded = await jwt.verify(auth.value as string);

        if (!decoded || !decoded.userId) {
            return status(401);
        }

        return {
            userId: decoded.userId as string,
        };
    })
    .get(
        "/",
        async ({ userId, query }) => {
            if (query.scope === "user") {
                const memories = await MemoryService.listUserMemories(Number(userId));

                return {
                    memories,
                };
            }

            const apiKeyId = query.apiKeyId ? Number(query.apiKeyId) : null;
            if (!apiKeyId) {
                return {
                    memories: [],
                };
            }

            const memories = await MemoryService.listMemoriesForApiKey(Number(userId), apiKeyId);

            return {
                memories,
            };
        },
        {
            query: MemoryModel.listMemoriesQuerySchema,
            response: {
                200: MemoryModel.getMemoriesResponseSchema,
            },
        }
    )
    .post(
        "/",
        async ({ userId, body }) => {
            const memory = await MemoryService.createMemory(Number(userId), {
                content: body.content,
                scope: body.scope,
                source: body.source,
                savedBy: body.savedBy,
                reasoning: body.reasoning,
                confidence: body.confidence,
                importance: body.importance,
                apiKeyId: body.apiKeyId ? Number(body.apiKeyId) : undefined,
            });

            return memory;
        },
        {
            body: MemoryModel.createMemorySchema,
            response: {
                200: MemoryModel.createMemoryResponseSchema,
            },
        }
    )
    .put(
        "/",
        async ({ userId, body, status }) => {
            try {
                const memory = await MemoryService.updateMemory(Number(userId), Number(body.id), {
                    content: body.content,
                    scope: body.scope,
                    source: body.source,
                    savedBy: body.savedBy,
                    reasoning: body.reasoning,
                    confidence: body.confidence,
                    importance: body.importance,
                    enabled: body.enabled,
                    archived: body.archived,
                });

                return memory;
            } catch {
                return status(400, {
                    message: "Failed to update memory",
                });
            }
        },
        {
            body: MemoryModel.updateMemorySchema,
            response: {
                200: MemoryModel.updateMemoryResponseSchema,
                400: t.Object({
                    message: t.Literal("Failed to update memory"),
                }),
            },
        }
    )
    .delete(
        "/:id",
        async ({ userId, params: { id }, status }) => {
            try {
                await MemoryService.deleteMemory(Number(userId), Number(id));

                return {
                    message: "Memory deleted successfully",
                };
            } catch {
                return status(400, {
                    message: "Failed to delete memory",
                });
            }
        },
        {
            response: {
                200: MemoryModel.deleteMemoryResponseSchema,
                400: t.Object({
                    message: t.Literal("Failed to delete memory"),
                }),
            },
        }
    )
    .post(
        "/:id/archive",
        async ({ userId, params: { id }, status }) => {
            try {
                return await MemoryService.archiveMemory(Number(userId), Number(id));
            } catch {
                return status(400, { message: "Failed to archive memory" });
            }
        }
    )
    .post(
        "/:id/restore",
        async ({ userId, params: { id }, status }) => {
            try {
                return await MemoryService.restoreMemory(Number(userId), Number(id));
            } catch {
                return status(400, { message: "Failed to restore memory" });
            }
        }
    )
    .post(
        "/find-duplicates",
        async ({ userId }) => {
            return MemoryService.findDuplicates(Number(userId));
        }
    )
    .post(
        "/merge",
        async ({ userId, body, status }) => {
            try {
                return await MemoryService.mergeMemories(
                    Number(userId),
                    Number(body.primaryId),
                    body.duplicateIds.map((id) => Number(id)),
                    body.content
                );
            } catch {
                return status(400, { message: "Failed to merge memories" });
            }
        },
        {
            body: t.Object({
                primaryId: t.String(),
                duplicateIds: t.Array(t.String()),
                content: t.Optional(t.String()),
            }),
        }
    )
    .post(
        "/compress",
        async ({ userId, body, status }) => {
            try {
                return await MemoryService.compressMemories(
                    Number(userId),
                    body.memoryIds.map((id) => Number(id))
                );
            } catch {
                return status(400, { message: "Failed to compress memories" });
            }
        },
        {
            body: t.Object({
                memoryIds: t.Array(t.String()),
            }),
        }
    )
    .post(
        "/compress/auto",
        async ({ userId, status }) => {
            try {
                return await MemoryService.autoCompressSimilarMemories(Number(userId));
            } catch {
                return status(400, { message: "Failed to auto-compress memories" });
            }
        }
    )
    .get(
        "/requests/:requestId",
        async ({ userId, params: { requestId }, status }) => {
            try {
                return await MemoryService.getRequestMemoryTrace(Number(userId), Number(requestId));
            } catch {
                return status(404, { message: "Request not found" });
            }
        }
    )
    .get(
        "/:id",
        async ({ userId, params: { id }, status }) => {
            try {
                return await MemoryService.getMemoryDetail(Number(userId), Number(id));
            } catch {
                return status(404, { message: "Memory not found" });
            }
        }
    );
