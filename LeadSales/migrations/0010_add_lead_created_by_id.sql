-- Add created_by_id to leads to track who originally created each lead.
-- IF NOT EXISTS makes this safe to run on databases where db:push already
-- applied the column (e.g. local dev), as well as fresh production databases.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "created_by_id" text;

-- Backfill existing rows: best available proxy is owner_id at migration time.
-- Only touches rows that are still NULL so re-running is safe.
UPDATE "leads"
SET "created_by_id" = "owner_id"
WHERE "created_by_id" IS NULL;
