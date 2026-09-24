import { eventQuerySchema, type KiwiEvent } from "@kiwi/core";
import { hasEventBackend, loadEventPage } from "@/lib/events";
import { NextResponse } from "next/server";
import { SAMPLE_EVENTS } from "@/lib/sample";
import { filterSample } from "@/lib/filter-sample";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?city=auckland&date=weekend&category=music&bbox=...
 *
 * Uses Railway when API_BASE_URL is set. Demo data is available locally or
 * with explicit DEMO_MODE=true; upstream failures always return 503.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query", issues: parsed.error.issues }, { status: 400 });
  }

  if (!hasEventBackend()) {
    if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
      return NextResponse.json({ error: "event backend is not configured" }, { status: 503 });
    }
    return NextResponse.json(demoPage(parsed.data));
  }

  try {
    const { events, nextCursor } = await loadEventPage(parsed.data);
    return NextResponse.json(
      { events, nextCursor, total: null, demo: false },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    console.error("findEvents failed", err);
    return NextResponse.json({ error: "events temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
}

function demoPage(q: ReturnType<typeof eventQuerySchema.parse>) {
  const events: KiwiEvent[] = filterSample(SAMPLE_EVENTS, q);
  return { events, nextCursor: null, total: events.length, demo: true };
}
