import { prisma } from "db";

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
    lastUsedAt: Date | null;
};

export async function retrieveMemoryForUser(
    userId: number,
    apiKeyId: number | null = null,
    limit = 5,
    memoryMode: "user" | "api_key" = "user"
) {
    const includeUserMemory = memoryMode === "user";
    const includeApiKeyMemory = memoryMode === "api_key";

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
            lastUsedAt: true,
        },
    });

    return memories as RetrievedMemory[];
}
