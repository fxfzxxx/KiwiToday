import { db, finishRun, getSourceConfig, markMissingRecordsGone, startRun } from "@kiwi/db";
import { eventfindaAdapter } from "../sources/eventfinda";
import { makeJsonLdAdapter } from "../sources/jsonld";
import type { SourceAdapter } from "../sources/types";
import { emptyStats, ingestListing, type IngestStats } from "./ingest";

/** Adapters we ship. Anything not listed here is treated as a JSON-LD source. */
const ADAPTERS: Record<string, SourceAdapter> = {
  eventfinda: eventfindaAdapter,
};

export function adapterFor(slug: string): SourceAdapter {
  return ADAPTERS[slug] ?? makeJsonLdAdapter(slug);
}

export interface RunOptions {
  horizonDays?: number;
  /** Print the first raw record and stop — for verifying a new field mapping. */
  dryRun?: boolean;
  /** Stop after this many listings. Useful with --dry-run. */
  limit?: number;
}

export async function runSource(slug: string, opts: RunOptions = {}): Promise<IngestStats> {
  const sql = db();
  const source = await getSourceConfig(slug, sql);
  if (!source) throw new Error(`unknown source "${slug}" — add a row to the sources table`);
  if (!source.enabled) {
    console.log(`source ${slug} is disabled, skipping`);
    return emptyStats();
  }

  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(extra ? `${msg} ${JSON.stringify(extra)}` : msg);

  const stats = emptyStats();
  const seenExternalIds: string[] = [];
  const runId = opts.dryRun ? null : await startRun(slug, sql);

  try {
    const adapter = adapterFor(slug);
    outer: for await (const batch of adapter.fetchAll({
      config: source.config as Record<string, unknown>,
      horizonDays: opts.horizonDays ?? 120,
      log,
    })) {
      for (const listing of batch) {
        if (opts.dryRun) {
          console.log(JSON.stringify({ normalized: { ...listing, raw: undefined }, raw: listing.raw }, null, 2));
          stats.fetched++;
          if (stats.fetched >= (opts.limit ?? 1)) break outer;
          continue;
        }
        seenExternalIds.push(listing.externalId);
        await ingestListing(listing, stats, sql);
        if (opts.limit && stats.fetched >= opts.limit) break outer;
      }
    }

    // Only tombstone on a complete, unlimited run — a partial crawl must never
    // be read as "everything else disappeared".
    if (!opts.dryRun && !opts.limit && seenExternalIds.length) {
      const gone = await markMissingRecordsGone(slug, seenExternalIds, sql);
      if (gone) log(`${slug}: tombstoned ${gone} listing(s) no longer upstream`);
    }

    if (runId) await finishRun(runId, { status: "ok", ...stats }, sql);
    log(`${slug}: ${JSON.stringify(stats)}`);
    return stats;
  } catch (err) {
    if (runId) {
      await finishRun(runId, { status: "failed", ...stats, error: String(err) }, sql).catch(() => {});
    }
    throw err;
  }
}
