import { prisma } from "db";

export type MemoryScope = "conversation" | "user" | "project" | "semantic";

type MemoryRecord = {
    id: number,
    userId: number,
    apiKeyId: number | null,
    scope: MemoryScope,
    content: string,
    source: string | null,
    confidence: number,
    importance: number,
    enabled: boolean,
    archived: boolean,
    createdAt: Date,
    updatedAt: Date;
    lastUsedAt: Date | null;
};

function serializeMemory(memory: MemoryRecord) {
    return {
        id: memory.id.toString(),
        userId: memory.userId.toString(),
        apiKeyId: memory.apiKeyId ? memory.apiKeyId.toString() : null,
        scope: memory.scope,
        content: memory.content,
        source: memory.source,
        confidence: memory.confidence,
        importance: memory.importance,
        enabled: memory.enabled,
        archived: memory.archived,
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
        lastUsedAt: memory.lastUsedAt ? memory.lastUsedAt.toISOString() : null,
    };
}

export abstract class MemoryService {
    static async listMemories(userId: number) {
        const records = await prisma.memory.findMany({
            where: {
                userId,
            },
            orderBy: [
                { importance: "desc" },
                { lastUsedAt: "desc" },
                { createdAt: "desc" }
            ],
        })

        return records.map(serializeMemory);
    }

    static async listMemoriesForApiKey(userId: number, apiKeyId: number) {
        const memories = await prisma.memory.findMany({
            where: {
                userId,
                apiKeyId,
            },
            orderBy: [
                { importance: "desc" },
                { lastUsedAt: "desc" },
                { createdAt: "desc" }
            ],
        });

        return memories.map(serializeMemory);
    }

    static async listUserMemories(userId: number) {
        const memories = await prisma.memory.findMany({
            where: {
                userId,
                apiKeyId: null,
            },
            orderBy: [
                { importance: "desc" },
                { lastUsedAt: "desc" },
                { createdAt: "desc" }
            ],
        });

        return memories.map(serializeMemory);
    }

    static async createMemory(
        userId: number,
        input: {
            content: string,
            scope?: MemoryScope,
            source?: string | null,
            confidence?: number,
            importance?: number,
            apiKeyId?: number | null,
        }
    ) {
        const memory = await prisma.memory.create({
            data: {
                userId,
                scope: input.scope ?? "user",
                content: input.content,
                source: input.source ?? null,
                confidence: input.confidence ?? 0.5,
                importance: input.importance ?? 1,
                apiKeyId: input.apiKeyId ?? null,
            }
        });

        return serializeMemory(memory)
    }

    static async updateMemory(
        userId: number,
        id: number,
        input: {
            content?: string,
            scope?: MemoryScope,
            source?: string | null,
            confidence?: number,
            importance?: number,
            enabled?: boolean,
            archived?: boolean
        }
    ) {
        const existing = await prisma.memory.findFirst({
            where: {
                id,
                userId
            }
        })

        if (!existing) {
            throw new Error("Memory not found")
        }

        const memory = await prisma.memory.update({
            where: {
                id: existing.id
            },
            data: {
                ...(input.content !== undefined ? { content: input.content } : {}),
                ...(input.scope !== undefined ? { scope: input.scope } : {}),
                ...(input.source !== undefined ? { source: input.source } : {}),
                ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
                ...(input.importance !== undefined ? { importance: input.importance } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                ...(input.archived !== undefined ? { archived: input.archived } : {})
            },
        });

        return serializeMemory(memory);
    }

    static async deleteMemory(userId: number, id: number) {
        const existing = await prisma.memory.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!existing) {
            throw new Error("Memory not found");
        }

        await prisma.memory.delete({
            where: {
                id: existing.id
            }
        })
    }
}
