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
    );
