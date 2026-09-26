import type { SourceAdapter } from "../sources/types";
import type { VenueSource } from "./catalog";
import { crawlVenue } from "./crawl";

export function venueAdapter(source: VenueSource): SourceAdapter {
  return {
    slug: source.slug,
    async *fetchAll(ctx) {
      const report = await crawlVenue(source, { days: Math.min(ctx.horizonDays, 366) });
      const failed = report.pages.filter((page) => page.status === "failed");
      ctx.log(`${source.slug}: partial venue coverage`, {
        pages: report.pages.length, events: report.events.length,
        dateOnly: report.dateOnlyAnnouncements.length, failed: failed.length, truncated: report.truncated,
      });
      if (failed.length) throw new Error(`${source.slug}: ${failed.length} pages failed; inspect venues report before ingesting`);
      if (!report.events.length) throw new Error(`${source.slug}: no timestamped events verified; run venues to inspect date-only announcements and extraction candidates`);
      // Only structured events enter the existing pipeline. Date-only and AI drafts
      // remain in the report until the full event fields have been verified.
      yield report.events;
    },
  };
}
