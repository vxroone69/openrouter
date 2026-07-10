-- Enable pgvector for semantic memory embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- Track how a memory was created.
CREATE TYPE "MemorySavedBy" AS ENUM ('manual', 'rule', 'llm', 'compression');

-- Memory metadata needed for semantic ranking, compression, and lifecycle audit.
ALTER TABLE "Memory"
ADD COLUMN "embedding" vector(1536),
ADD COLUMN "savedBy" "MemorySavedBy" NOT NULL DEFAULT 'manual',
ADD COLUMN "reasoning" TEXT,
ADD COLUMN "compressedFrom" JSONB,
ADD COLUMN "compressedIntoId" INTEGER,
ADD COLUMN "isCompressed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Memory"
ALTER COLUMN "importance" SET DATA TYPE DOUBLE PRECISION USING "importance"::DOUBLE PRECISION,
ALTER COLUMN "importance" SET DEFAULT 0.5;

CREATE INDEX "Memory_userId_archivedAt_idx" ON "Memory"("userId", "archivedAt");
CREATE INDEX "Memory_userId_isCompressed_idx" ON "Memory"("userId", "isCompressed");
CREATE INDEX "Memory_embedding_idx" ON "Memory" USING ivfflat ("embedding" vector_cosine_ops);

-- Request-level memory visibility and cost accounting.
ALTER TABLE "RequestLog"
ADD COLUMN "injectedMemories" JSONB,
ADD COLUMN "memoryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "memoryInjected" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "regularInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "baseCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "memoryCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cachedSavings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "costBreakdown" JSONB;
