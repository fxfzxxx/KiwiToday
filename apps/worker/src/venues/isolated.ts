import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { VenueSource } from "./catalog";
import type { VenueReport } from "./crawl";

/** Bound even synchronous parser stalls, which AbortSignal cannot interrupt. */
export async function isolatedCrawl(venue: VenueSource, days: number): Promise<VenueReport> {
  try {
    return await new Promise<VenueReport>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./crawl-child.ts", import.meta.url)), venue.slug, String(days)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Venue crawl exceeded 60 seconds")); }, 60_000);
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); if (stdout.length > 5_000_000) { child.kill(); reject(new Error("Report exceeds size limit")); } });
      child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1000); });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) { reject(new Error(`Crawl process failed: ${stderr || code}`)); return; }
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
    });
  } catch (error) {
    const checkedAt = new Date().toISOString();
    return { venue, checkedAt, days, coverage: "partial", truncated: true, events: [], dateOnlyAnnouncements: [],
      pages: [{ url: venue.seeds[0]!, checkedAt, status: "failed", contentHash: "", text: "", error: String(error) }] };
  }
}
