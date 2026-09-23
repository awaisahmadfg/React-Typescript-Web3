CREATE TABLE IF NOT EXISTS "plan_teams" (
  "plan_id" text NOT NULL,
  "team_id" text NOT NULL,
  PRIMARY KEY ("plan_id", "team_id")
);
