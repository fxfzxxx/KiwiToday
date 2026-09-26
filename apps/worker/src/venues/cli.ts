import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { VENUE_SOURCES } from "./catalog";
import { isolatedCrawl } from "./isolated";
import { extractDrafts } from "./ai";

const { values } = parseArgs({ options: {
  venue: { type: "string" }, days: { type: "string", default: "30" },
  out: { type: "string", default: "../../artifacts/venues" },
  ai: { type: "boolean", default: false }, "ai-pages": { type: "string", default: "3" },
} });
const selected = VENUE_SOURCES.filter((venue) => !values.venue || venue.slug === values.venue);
if (!selected.length) throw new Error(`Unknown venue. Available: ${VENUE_SOURCES.map((venue) => venue.slug).join(", ")}`);
const budget = Number(values["ai-pages"]);
if (!Number.isInteger(budget) || budget < 0 || budget > 20) throw new Error("ai-pages must be 0–20");
if (values.ai && (!process.env.ANTHROPIC_API_KEY || !process.env.ENRICH_MODEL)) throw new Error("Set ANTHROPIC_API_KEY and ENRICH_MODEL before --ai");
const out = resolve(values.out);
const days = Number(values.days);
if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("days must be 1–366");
await mkdir(out, { recursive: true });
let remaining = budget;
for (const venue of selected) {
  console.log(`Checking ${venue.name}`);
  const report = await isolatedCrawl(venue, days);
  const drafts: unknown[] = [];
  for (const page of report.pages) {
    if (!values.ai || !remaining || page.status !== "needs-extraction" || !page.text) continue;
    remaining--;
    try {
      const events = await extractDrafts(page, join(out, ".ai-cache"));
      drafts.push({ sourceUrl: page.url, checkedAt: page.checkedAt, status: "needs-human-review", events });
    } catch (error) { drafts.push({ sourceUrl: page.url, status: "failed", error: String(error) }); }
  }
  await writeFile(join(out, `${venue.slug}.json`), JSON.stringify({ ...report, aiDrafts: drafts }, null, 2));
  const lines = [`# ${venue.name}：未来 ${report.days} 天已发现活动`, "",
    `核验时间：${report.checkedAt}`, "",
    "覆盖状态：部分采集。未发现不代表没有活动；AI 草稿待人工核验，不计入以下清单。", "",
    ...report.events.map((event) => `- ${event.startsAt.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZ — ${event.title.replace(/[\r\n]/g, " ")} — ${event.url}`),
    "", "## 已公布日期（开场时间未核验）", "",
    ...report.dateOnlyAnnouncements.map((event) => `- ${event.date} — ${event.title} — ${event.sourceUrl}`),
    "", `完整活动 ${report.events.length} 条；仅日期公告 ${report.dateOnlyAnnouncements.length} 条；检查 ${report.pages.length} 页；失败 ${report.pages.filter((page) => page.status === "failed").length} 页；达到页数上限：${report.truncated}。`,
  ];
  await writeFile(join(out, `${venue.slug}.md`), lines.join("\n"));
  console.log(`${venue.slug}: ${report.events.length} timestamped events, ${report.dateOnlyAnnouncements.length} date-only announcements, ${report.pages.length} pages; report saved`);
}
