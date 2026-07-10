import { prisma } from "db";
import { generateMemoryCompression, generateMemoryEmbedding, toPgVector } from "./embedding";

export type MemoryScope = "conversation" | "user" | "project" | "semantic";
export type MemorySavedBy = "manual" | "rule" | "llm" | "compression";

type MemoryRecord = {
    id: number,
    userId: number,
    apiKeyId: number | null,
    scope: MemoryScope,
    content: string,
    source: string | null,
    savedBy: MemorySavedBy,
    reasoning: string | null,
    confidence: number,
    importance: number,
    compressedFrom: unknown,
    compressedIntoId: number | null,
    isCompressed: boolean,
    enabled: boolean,
    archived: boolean,
    archivedAt: Date | null,
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
        savedBy: memory.savedBy,
        reasoning: memory.reasoning,
        confidence: memory.confidence,
        importance: memory.importance,
        compressedFrom: memory.compressedFrom,
        compressedIntoId: memory.compressedIntoId ? memory.compressedIntoId.toString() : null,
        isCompressed: memory.isCompressed,
        enabled: memory.enabled,
        archived: memory.archived,
        archivedAt: memory.archivedAt ? memory.archivedAt.toISOString() : null,
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
        lastUsedAt: memory.lastUsedAt ? memory.lastUsedAt.toISOString() : null,
    };
}

async function refreshEmbedding(memoryId: number, content: string) {
    try {
        const embedding = await generateMemoryEmbedding(content);
        if (!embedding) return;

        await prisma.$executeRawUnsafe(`
            UPDATE "Memory"
            SET "embedding" = '${toPgVector(embedding)}'::vector
            WHERE "id" = ${memoryId}
        `);
    } catch (error) {
        console.error("Failed to persist memory embedding:", error);
    }
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
            savedBy?: MemorySavedBy,
            reasoning?: string | null,
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
                savedBy: input.savedBy ?? "manual",
                reasoning: input.reasoning ?? null,
                confidence: input.confidence ?? 0.5,
                importance: input.importance ?? 0.5,
                apiKeyId: input.apiKeyId ?? null,
            }
        });

        void refreshEmbedding(memory.id, memory.content).catch((error) => {
            console.error("Failed to persist memory embedding:", error);
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
            savedBy?: MemorySavedBy,
            reasoning?: string | null,
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
                ...(input.savedBy !== undefined ? { savedBy: input.savedBy } : {}),
                ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
                ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
                ...(input.importance !== undefined ? { importance: input.importance } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                ...(input.archived !== undefined ? {
                    archived: input.archived,
                    archivedAt: input.archived ? new Date() : null,
                } : {})
            },
        });

        if (input.content !== undefined) {
            void refreshEmbedding(memory.id, memory.content).catch((error) => {
                console.error("Failed to refresh memory embedding:", error);
            });
        }

        return serializeMemory(memory);
    }

    static async archiveMemory(userId: number, id: number) {
        return this.updateMemory(userId, id, { archived: true, enabled: false });
    }

    static async restoreMemory(userId: number, id: number) {
        return this.updateMemory(userId, id, { archived: false, enabled: true });
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

    static async findDuplicates(userId: number) {
        const rows = await prisma.$queryRawUnsafe<Array<{
            memoryId: number;
            duplicateId: number;
            similarity: number;
        }>>(`
            SELECT
                a."id" AS "memoryId",
                b."id" AS "duplicateId",
                GREATEST(0, 1 - (a."embedding" <=> b."embedding")) AS "similarity"
            FROM "Memory" a
            JOIN "Memory" b ON a."userId" = b."userId" AND a."id" < b."id"
            WHERE a."userId" = ${userId}
            AND a."archived" = false
            AND b."archived" = false
            AND a."archivedAt" IS NULL
            AND b."archivedAt" IS NULL
            AND a."embedding" IS NOT NULL
            AND b."embedding" IS NOT NULL
            AND GREATEST(0, 1 - (a."embedding" <=> b."embedding")) >= 0.95
            ORDER BY "similarity" DESC
            LIMIT 50
        `);

        return { duplicates: rows };
    }

    static async mergeMemories(userId: number, primaryId: number, duplicateIds: number[], content?: string) {
        const primary = await prisma.memory.findFirst({
            where: { id: primaryId, userId },
        });

        if (!primary) {
            throw new Error("Primary memory not found");
        }

        const duplicates = await prisma.memory.findMany({
            where: {
                userId,
                id: { in: duplicateIds },
            },
            select: { id: true },
        });

        const archivedIds = duplicates.map((memory) => memory.id);
        const memory = await prisma.memory.update({
            where: { id: primary.id },
            data: {
                ...(content ? { content } : {}),
                compressedFrom: archivedIds,
                updatedAt: new Date(),
            },
        });

        await prisma.memory.updateMany({
            where: {
                userId,
                id: { in: archivedIds },
            },
            data: {
                archived: true,
                enabled: false,
                archivedAt: new Date(),
                compressedIntoId: primary.id,
            },
        });

        if (content) {
            void refreshEmbedding(memory.id, memory.content).catch((error) => {
                console.error("Failed to refresh merged memory embedding:", error);
            });
        }

        return serializeMemory(memory);
    }

    static async compressMemories(userId: number, memoryIds: number[]) {
        const memories = await prisma.memory.findMany({
            where: {
                userId,
                id: { in: memoryIds },
                archived: false,
            },
            orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        });

        if (memories.length < 2) {
            throw new Error("At least two active memories are required");
        }

        const prompt = [
            "Summarize these user or project memories into one concise durable memory.",
            "Output only the summary, max 24 words.",
            ...memories.map((memory) => `- ${memory.content}`),
        ].join("\n");

        const compressedContent = await generateMemoryCompression(prompt) || memories[0]!.content;
        const avgConfidence = memories.reduce((sum, memory) => sum + memory.confidence, 0) / memories.length;
        const maxImportance = Math.max(...memories.map((memory) => memory.importance));
        const first = memories[0]!;

        const compressed = await prisma.memory.create({
            data: {
                userId,
                apiKeyId: first.apiKeyId,
                scope: first.scope,
                content: compressedContent,
                source: "memory/compression",
                savedBy: "compression",
                reasoning: `Auto-compressed from ${memories.length} related memories`,
                confidence: avgConfidence,
                importance: maxImportance,
                compressedFrom: memories.map((memory) => memory.id),
                isCompressed: true,
                lastUsedAt: new Date(),
            },
        });

        await prisma.memory.updateMany({
            where: {
                userId,
                id: { in: memories.map((memory) => memory.id) },
            },
            data: {
                archived: true,
                enabled: false,
                archivedAt: new Date(),
                compressedIntoId: compressed.id,
            },
        });

        void refreshEmbedding(compressed.id, compressed.content).catch((error) => {
            console.error("Failed to persist compressed memory embedding:", error);
        });

        return serializeMemory(compressed);
    }

    static async autoCompressSimilarMemories(userId: number) {
        const rows = await prisma.$queryRawUnsafe<Array<{
            seedId: number;
            similarId: number;
            similarity: number;
        }>>(`
            SELECT
                a."id" AS "seedId",
                b."id" AS "similarId",
                GREATEST(0, 1 - (a."embedding" <=> b."embedding")) AS "similarity"
            FROM "Memory" a
            JOIN "Memory" b ON a."userId" = b."userId" AND a."id" <> b."id"
            WHERE a."userId" = ${userId}
            AND a."archived" = false
            AND b."archived" = false
            AND a."archivedAt" IS NULL
            AND b."archivedAt" IS NULL
            AND a."embedding" IS NOT NULL
            AND b."embedding" IS NOT NULL
            AND GREATEST(0, 1 - (a."embedding" <=> b."embedding")) >= 0.85
            ORDER BY "similarity" DESC
            LIMIT 200
        `);

        const clusters = new Map<number, Set<number>>();
        for (const row of rows) {
            const cluster = clusters.get(row.seedId) ?? new Set<number>([row.seedId]);
            cluster.add(row.similarId);
            clusters.set(row.seedId, cluster);
        }

        const selected = [...clusters.values()]
            .map((cluster) => [...cluster])
            .find((cluster) => cluster.length >= 4);

        if (!selected) {
            return {
                compressed: null,
                message: "No cluster with at least four similar memories found",
            };
        }

        return {
            compressed: await this.compressMemories(userId, selected),
            message: `Compressed ${selected.length} similar memories`,
        };
    }

    static async getRequestMemoryTrace(userId: number, requestId: number) {
        const request = await prisma.requestLog.findFirst({
            where: { id: requestId, userId },
            select: {
                id: true,
                model: true,
                provider: true,
                createdAt: true,
                injectedMemories: true,
                memoryCount: true,
                memoryInjected: true,
                promptTokens: true,
                completionTokens: true,
                cachedInputTokens: true,
                regularInputTokens: true,
                baseCost: true,
                memoryCost: true,
                cachedSavings: true,
                cost: true,
                costBreakdown: true,
            },
        });

        if (!request) {
            throw new Error("Request not found");
        }

        return {
            request: {
                id: request.id.toString(),
                model: request.model,
                provider: request.provider,
                createdAt: request.createdAt.toISOString(),
            },
            injection: {
                considered: request.memoryCount,
                injected: request.memoryInjected,
                notInjected: Math.max(0, request.memoryCount - request.memoryInjected),
            },
            injectedMemories: request.injectedMemories ?? [],
            cost: {
                inputTokens: request.promptTokens,
                outputTokens: request.completionTokens,
                cachedInputTokens: request.cachedInputTokens,
                regularInputTokens: request.regularInputTokens,
                baseCost: request.baseCost,
                memoryCost: request.memoryCost,
                cachingSavings: request.cachedSavings,
                totalRequestCost: request.cost,
                breakdown: request.costBreakdown,
            },
        };
    }

    static async getMemoryDetail(userId: number, id: number) {
        const memory = await prisma.memory.findFirst({
            where: { id, userId },
        });

        if (!memory) {
            throw new Error("Memory not found");
        }

        const logs = await prisma.requestLog.findMany({
            where: {
                userId,
                injectedMemories: {
                    path: ["memoryId"],
                    equals: id,
                },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
        }).catch(() => []);

        return {
            memory: serializeMemory(memory),
            usage: {
                totalRequestsUsed: logs.length,
                lastUsedAt: memory.lastUsedAt ? memory.lastUsedAt.toISOString() : null,
            },
            recentUsage: logs.map((log) => ({
                requestId: log.id.toString(),
                sentAt: log.createdAt.toISOString(),
                model: log.model,
                provider: log.provider,
            })),
        };
    }
}
