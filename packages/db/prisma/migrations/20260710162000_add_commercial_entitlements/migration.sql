CREATE TYPE "UserPlan" AS ENUM ('free', 'pro');

ALTER TABLE "User"
ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'free';

ALTER TABLE "Model"
ADD COLUMN "minPlan" "UserPlan" NOT NULL DEFAULT 'free';

UPDATE "Model"
SET "minPlan" = 'pro'
WHERE "slug" LIKE 'openai/%'
OR "slug" LIKE 'anthropic/%'
OR "slug" = 'google/gemini-3-flash-preview';
