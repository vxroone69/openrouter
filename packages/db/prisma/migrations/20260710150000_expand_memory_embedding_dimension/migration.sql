DROP INDEX IF EXISTS "Memory_embedding_idx";

ALTER TABLE "Memory"
ALTER COLUMN "embedding" TYPE vector(3072)
USING NULL;
