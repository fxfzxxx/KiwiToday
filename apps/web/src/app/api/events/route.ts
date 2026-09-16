import { eventQuerySchema, type KiwiEvent } from "@kiwi/core";
import { findEvents } from "@kiwi/db";
import { NextResponse } from "next/server";
import { SAMPLE_EVENTS } from "@/lib/sample";
import { filterSample } from "@/lib/filter-sample";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?city=auckland&date=weekend&category=music&bbox=...
 *
 * Falls back to demo data when DATABASE_URL is unset or unreachable, so the
 * frontend is developable before the ingestion pipeline has ever run. The
 * `demo` flag in the response is what the UI uses to say so out loud.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query", issues: parsed.error.issues }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(demoPage(parsed.data));
  }

  try {
    const { events, nextCursor } = await findEvents(parsed.data);
    return NextResponse.json(
      { events, nextCursor, total: null, demo: false },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    // A database blip should degrade to demo data rather than a blank page —
    // but say so, so it is never mistaken for a quiet weekend.
    console.error("findEvents failed", err);
    return NextResponse.json({ ...demoPage(parsed.data), degraded: true }, { status: 200 });
  }
}

function demoPage(q: ReturnType<typeof eventQuerySchema.parse>) {
  const events: KiwiEvent[] = filterSample(SAMPLE_EVENTS, q);
  return { events, nextCursor: null, total: events.length, demo: true };
}
