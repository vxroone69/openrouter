/*
  Warnings:

  - A unique constraint covering the columns `[apiKey]` on the table `ApiKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `apiKey` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "Deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "Disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apiKey" TEXT NOT NULL,
ADD COLUMN     "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastUsed" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_apiKey_key" ON "ApiKey"("apiKey");
