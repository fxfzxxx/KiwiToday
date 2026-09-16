/**
 * Minimal forward-only migration runner. Each file in migrations/ runs once,
 * inside a transaction, recorded in schema_migrations.
 *
 * No down-migrations by design: rolling back a schema on a live aggregator is
 * how you lose a week of crawl history. Write a new forward migration.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, db } from "./client";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(): Promise<void> {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`→ ${file}\n`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    ran++;
  }
  process.stdout.write(ran ? `✓ applied ${ran} migration(s)\n` : "✓ schema up to date\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(closeDb)
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
