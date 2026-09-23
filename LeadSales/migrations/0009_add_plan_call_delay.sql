ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "call_delay_days" integer NOT NULL DEFAULT 0;
