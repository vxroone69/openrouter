ALTER TABLE "OnrampTransaction"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerSessionId" TEXT,
ADD COLUMN "providerPaymentIntentId" TEXT,
ADD COLUMN "packageId" TEXT,
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'credits',
ADD COLUMN "metadata" JSONB;

CREATE UNIQUE INDEX "OnrampTransaction_providerSessionId_key"
ON "OnrampTransaction"("providerSessionId");
