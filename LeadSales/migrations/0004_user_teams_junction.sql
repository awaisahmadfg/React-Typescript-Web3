CREATE TABLE IF NOT EXISTS "user_teams" (
  "user_id" text NOT NULL,
  "team_id" text NOT NULL,
  CONSTRAINT "user_teams_pkey" PRIMARY KEY ("user_id", "team_id")
);

-- Backfill from existing users.team_id
INSERT INTO "user_teams" ("user_id", "team_id")
SELECT "id", "team_id" FROM "users" WHERE "team_id" IS NOT NULL
ON CONFLICT DO NOTHING;
