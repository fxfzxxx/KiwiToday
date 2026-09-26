import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { VenueSnapshot } from "@kiwi/core";
import { VENUE_SOURCES } from "./catalog";
import type { VenueReport } from "./crawl";

const snapshot: VenueSnapshot = { generatedAt: new Date().toISOString(), venues: [], events: [] };
const reports = resolve("../../artifacts/venues");
const nzDate = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
for (const venue of VENUE_SOURCES) {
  let report: VenueReport | null = null;
  try { report = JSON.parse(await readFile(join(reports, `${venue.slug}.json`), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const items = [
    ...(report?.events ?? []).map((event) => {
      const raw = (event.raw as { data?: Record<string, unknown> } | undefined)?.data;
      const rawImage = Array.isArray(raw?.image) ? raw?.image[0] : raw?.image;
      const imageUrl = typeof rawImage === "string" && /^https:\/\//.test(rawImage) ? rawImage : undefined;
      const summary = typeof raw?.description === "string" ? raw.description.replace(/\s+/g, " ").trim().slice(0, 320) : undefined;
      return { title: event.title, date: nzDate(event.startsAt), startsAt: new Date(event.startsAt).toISOString(), sourceUrl: event.url, precision: "time" as const, ...(imageUrl ? { imageUrl } : {}), ...(summary ? { summary } : {}) };
    }),
    ...(report?.dateOnlyAnnouncements ?? []).map((event) => ({ title: event.title, date: event.date, ...(event.endDate ? { endDate: event.endDate } : {}), startsAt: null, sourceUrl: event.sourceUrl, precision: "day" as const, ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}), ...(event.summary ? { summary: event.summary } : {}), ...(event.scheduleText ? { scheduleText: event.scheduleText } : {}), ...(event.sessionDates?.length ? { sessionDates: event.sessionDates } : {}) })),
  ];
  const failed = report?.pages.filter((page) => page.status === "failed").length ?? 0;
  snapshot.venues.push({ slug: venue.slug, name: venue.name, city: venue.city, url: venue.seeds[0]!, checkedAt: report?.checkedAt ?? null,
    status: !report ? "pending" : items.length ? "found" : failed === report.pages.length ? "failed" : "needs-extraction",
    pages: report?.pages.length ?? 0, failedPages: failed, truncated: report?.truncated ?? false });
  for (const item of items) {
    if (!/^https:\/\//.test(item.sourceUrl)) continue;
    const id = createHash("sha256").update(`${venue.slug}|${item.title}|${item.date}|${item.sourceUrl}`).digest("hex").slice(0, 20);
    if (snapshot.events.some((event) => event.id === id)) continue;
    snapshot.events.push({ ...item, id, venueSlug: venue.slug, checkedAt: report!.checkedAt });
  }
}
snapshot.events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
const target = resolve("../web/src/data/venue-snapshot.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(snapshot, null, 2));
console.log(`Published local snapshot: ${snapshot.venues.length} venues, ${snapshot.events.length} listings -> ${target}`);
