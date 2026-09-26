import { eventQuerySchema } from "@kiwi/core";
import { NextResponse } from "next/server";
import { venueSnapshotEvents } from "@/lib/venue-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?city=auckland&date=weekend&category=music&bbox=...
 *
 * Serves the same verified venue snapshot used by the venue explorer.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = eventQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query", issues: parsed.error.issues }, { status: 400 });
  }

  const events = venueSnapshotEvents(parsed.data);
  return NextResponse.json(
    { events, nextCursor: null, total: events.length },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
