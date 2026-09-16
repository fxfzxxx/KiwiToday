/**
 * One-off ingestion runner.
 *
 *   pnpm ingest -- --source eventfinda
 *   pnpm ingest -- --source eventfinda --dry-run --limit 1
 *   pnpm ingest -- --all
 */
import { parseArgs } from "node:util";
import { closeDb, db } from "@kiwi/db";
import { runSource } from "./pipeline/run";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    all: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
    horizon: { type: "string" },
  },
  allowPositionals: true,
});

async function main() {
  const slugs = values.all
    ? (await db()<{ slug: string }[]>`SELECT slug FROM sources WHERE enabled ORDER BY slug`).map((r) => r.slug)
    : values.source
      ? [values.source]
      : [];

  if (!slugs.length) {
    console.error("usage: pnpm ingest -- --source <slug> | --all  [--dry-run] [--limit N] [--horizon DAYS]");
    process.exit(2);
  }

  let failed = 0;
  for (const slug of slugs) {
    try {
      await runSource(slug, {
        dryRun: values["dry-run"],
        limit: values.limit ? Number(values.limit) : undefined,
        horizonDays: values.horizon ? Number(values.horizon) : undefined,
      });
    } catch (err) {
      // One broken source must not take down the rest of the crawl.
      failed++;
      console.error(`✗ ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  process.exitCode = failed && failed === slugs.length ? 1 : 0;
}

main().finally(closeDb);
