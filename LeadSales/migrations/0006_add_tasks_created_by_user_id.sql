ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;

-- Backfill old records so permissions are consistent.
UPDATE "tasks"
SET "created_by_user_id" = "user_id"
WHERE "created_by_user_id" IS NULL;
