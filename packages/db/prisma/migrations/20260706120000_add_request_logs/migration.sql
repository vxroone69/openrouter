-- CreateEnum
CREATE TYPE "RequestLogStatus" AS ENUM ('success', 'error', 'rate_limited');

-- CreateEnum
CREATE TYPE "RequestLogErrorType" AS ENUM ('timeout', 'provider_5xx', 'invalid_request', 'rate_limit', 'other');

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiKeyId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT,
    "status" "RequestLogStatus" NOT NULL,
    "errorType" "RequestLogErrorType",
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackCount" INTEGER NOT NULL DEFAULT 1,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "streaming" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL,
    "ttftMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestLog_userId_createdAt_idx" ON "RequestLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestLog_model_createdAt_idx" ON "RequestLog"("model", "createdAt");

-- CreateIndex
CREATE INDEX "RequestLog_provider_createdAt_idx" ON "RequestLog"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
