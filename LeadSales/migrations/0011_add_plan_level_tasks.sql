ALTER TABLE "tasks" ALTER COLUMN "lead_id" DROP NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "plan_id" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "schedule_key" text;

CREATE INDEX IF NOT EXISTS "tasks_plan_id_idx" ON "tasks" ("plan_id");
CREATE INDEX IF NOT EXISTS "tasks_schedule_key_idx" ON "tasks" ("schedule_key");
