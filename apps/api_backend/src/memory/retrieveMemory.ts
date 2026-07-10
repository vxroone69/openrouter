import { prisma } from "db";
import { generateMemoryEmbedding, toPgVector } from "./embeddings";
import { rankAndSelectMemories, type RankedMemory } from "./rankMemory";

export type MemoryScope = "conversation" | "user" | "project" | "semantic";

export type RetrievedMemory = {
    id: number;
    userId: number;
    apiKeyId: number | null;
    scope: MemoryScope;
    content: string;
    source: string | null;
    confidence: number;
    importance: number;
    isCompressed: boolean;
    createdAt: Date;
    lastUsedAt: Date | null;
    semanticSimilarity?: number;
};

export async function retrieveMemoryForUser(
    userId: number,
    apiKeyId: number | null = null,
    limit = 5,
    memoryMode: "none" | "user" | "api_key" = "user",
    prompt?: string,
    tokenBudget = 500
) {
    if (memoryMode === "none") {
        return [];
    }

    const includeUserMemory = memoryMode === "user";
    const includeApiKeyMemory = memoryMode === "api_key";

    const ownerClauses = [
        ...(includeUserMemory ? [`"apiKeyId" IS NULL`] : []),
        ...(includeApiKeyMemory && apiKeyId != null ? [`"apiKeyId" = ${apiKeyId}`] : []),
    ];

    if (prompt && ownerClauses.length > 0) {
        const embedding = await generateMemoryEmbedding(prompt);

        if (embedding) {
            try {
                const vector = toPgVector(embedding);
                const rows = await prisma.$queryRawUnsafe<RetrievedMemory[]>(`
                    SELECT
                        "id",
                        "userId",
                        "apiKeyId",
                        "scope",
                        "content",
                        "source",
                        "confidence",
                        "importance",
                        "isCompressed",
                        "createdAt",
                        "lastUsedAt",
                        GREATEST(0, 1 - ("embedding" <=> '${vector}'::vector)) AS "semanticSimilarity"
                    FROM "Memory"
                    WHERE "userId" = ${userId}
                    AND "enabled" = true
                    AND "archived" = false
                    AND "archivedAt" IS NULL
                    AND "embedding" IS NOT NULL
                    AND (${ownerClauses.join(" OR ")})
                    ORDER BY "embedding" <=> '${vector}'::vector
                    LIMIT 100
                `);

                if (rows.length > 0) {
                    return rankAndSelectMemories(rows, { maxMemoryTokens: tokenBudget })
                        .filter((memory) => memory.willInject)
                        .slice(0, limit);
                }
            } catch (error) {
                console.error("Semantic memory retrieval failed, falling back:", error);
            }
        }
    }

    const memories = await prisma.memory.findMany({
        where: {
            userId,
            enabled: true,
            archived: false,
            OR: [
                ...(includeUserMemory ? [{ apiKeyId: null }] : []),
                ...(includeApiKeyMemory && apiKeyId != null ? [{ apiKeyId }] : []),
            ],
        },
        orderBy: [
            { importance: "desc" },
            { lastUsedAt: "desc" },
            { createdAt: "desc" },
        ],
        take: limit,
        select: {
            id: true,
            userId: true,
            apiKeyId: true,
            scope: true,
            content: true,
            source: true,
            confidence: true,
            importance: true,
            isCompressed: true,
            createdAt: true,
            lastUsedAt: true,
        },
    });

    return rankAndSelectMemories(memories as RetrievedMemory[], { maxMemoryTokens: tokenBudget })
        .filter((memory: RankedMemory) => memory.willInject)
        .slice(0, limit);
}

export async function markMemoriesUsed(memoryIds: number[]) {
    if (memoryIds.length === 0) return;

    await prisma.memory.updateMany({
        where: {
            id: { in: memoryIds },
        },
        data: {
            lastUsedAt: new Date(),
        },
    });
}
