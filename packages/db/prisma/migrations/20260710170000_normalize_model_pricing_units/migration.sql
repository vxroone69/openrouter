ALTER TABLE "ModelProviderMapping"
RENAME COLUMN "inputTokenCost" TO "inputTokenCostNanoDollars";

ALTER TABLE "ModelProviderMapping"
RENAME COLUMN "outputTokenCost" TO "outputTokenCostNanoDollars";

-- Legacy seed values were "$ per 1M tokens" stored in numeric columns.
-- One "$ per 1M tokens" equals 1000 nano-dollars per token.
UPDATE "ModelProviderMapping"
SET
  "inputTokenCostNanoDollars" = ROUND("inputTokenCostNanoDollars" * 1000),
  "outputTokenCostNanoDollars" = ROUND("outputTokenCostNanoDollars" * 1000)
WHERE "inputTokenCostNanoDollars" < 100
OR "outputTokenCostNanoDollars" < 100;
