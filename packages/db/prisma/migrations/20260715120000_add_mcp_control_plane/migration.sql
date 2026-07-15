CREATE TYPE "McpToolExecutionStatus" AS ENUM ('success', 'error');

CREATE TABLE "McpServer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB,
    "env" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDiscoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpTool" (
    "id" SERIAL NOT NULL,
    "serverId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpTool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpApiKeyTool" (
    "id" SERIAL NOT NULL,
    "apiKeyId" INTEGER NOT NULL,
    "toolId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpApiKeyTool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McpToolExecution" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiKeyId" INTEGER,
    "serverId" INTEGER NOT NULL,
    "toolId" INTEGER,
    "toolName" TEXT NOT NULL,
    "status" "McpToolExecutionStatus" NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpServer_userId_enabled_idx" ON "McpServer"("userId", "enabled");
CREATE UNIQUE INDEX "McpTool_serverId_name_key" ON "McpTool"("serverId", "name");
CREATE INDEX "McpTool_serverId_enabled_idx" ON "McpTool"("serverId", "enabled");
CREATE UNIQUE INDEX "McpApiKeyTool_apiKeyId_toolId_key" ON "McpApiKeyTool"("apiKeyId", "toolId");
CREATE INDEX "McpApiKeyTool_toolId_enabled_idx" ON "McpApiKeyTool"("toolId", "enabled");
CREATE INDEX "McpToolExecution_userId_createdAt_idx" ON "McpToolExecution"("userId", "createdAt");
CREATE INDEX "McpToolExecution_serverId_createdAt_idx" ON "McpToolExecution"("serverId", "createdAt");
CREATE INDEX "McpToolExecution_toolId_createdAt_idx" ON "McpToolExecution"("toolId", "createdAt");

ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpApiKeyTool" ADD CONSTRAINT "McpApiKeyTool_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpApiKeyTool" ADD CONSTRAINT "McpApiKeyTool_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "McpTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpToolExecution" ADD CONSTRAINT "McpToolExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpToolExecution" ADD CONSTRAINT "McpToolExecution_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "McpToolExecution" ADD CONSTRAINT "McpToolExecution_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpToolExecution" ADD CONSTRAINT "McpToolExecution_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "McpTool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
