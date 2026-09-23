/**
 * Fix migration history for databases set up via `db:push` instead of `db:migrate`.
 *
 * Problem: `db:push` creates tables but doesn't record anything in Drizzle's
 * `__drizzle_migrations` tracking table.  When `db:migrate` runs later, it
 * tries to re-apply every migration from scratch and fails because the tables
 * already exist.
 *
 * Solution: Insert rows into the tracking table for migrations 0000–0003
 * (which were already applied via db:push), so that `db:migrate` only runs
 * new migrations (0004+).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx script/fix-migration-history.ts
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");

// Migrations that were applied via db:push (everything before the multi-team migration)
const alreadyAppliedTags = [
  "0000_init_schema",
  "0001_client_invoice_entry_history",
  "0002_add_lead_source_value",
  "0003_enforce_lead_unique_identifiers",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf-8"),
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Ensure the schema and table exist
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    for (const tag of alreadyAppliedTags) {
      const entry = journal.entries.find((e: any) => e.tag === tag);
      if (!entry) {
        console.warn(`⚠ Journal entry not found for ${tag}, skipping`);
        continue;
      }

      const sqlContent = fs.readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf-8");
      const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

      // Check if already recorded
      const existing = await pool.query(
        `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1`,
        [hash],
      );

      if (existing.rows.length > 0) {
        console.log(`✓ ${tag} — already recorded`);
        continue;
      }

      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when],
      );
      console.log(`✓ ${tag} — recorded (hash: ${hash.slice(0, 12)}…)`);
    }

    console.log("\n✅ Migration history fixed. You can now run: npm run db:migrate");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
