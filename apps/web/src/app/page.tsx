import { CITIES, eventQuerySchema, getCity, type KiwiEvent, type VenueSnapshot } from "@kiwi/core";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { venueSnapshotEvents } from "@/lib/venue-events";
import { Shell } from "@/components/Shell";
import snapshotData from "@/data/venue-snapshot.json";

const snapshot = snapshotData as VenueSnapshot;

/**
 * Server-rendered so the first paint carries real event content. This is the
 * whole SEO argument for Next over a SPA: "things to do in Auckland this
 * weekend" has to be answerable by a crawler that runs no JavaScript.
 */
export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const city = getCity(String(sp.city ?? "auckland"));
  if (!city) return {};
  const venue = typeof sp.venue === "string" ? snapshot.venues.find((item) => item.slug === sp.venue) : undefined;
  return {
    title: venue ? `${venue.name} 活动 · KiwiToday` : `${city.zh}本地活动 · What's on in ${city.en}`,
    description: venue ? `${venue.name} 已公布的近期活动、演出日期和详情。` : `${city.zh}近期的市集、演出、户外与赛事聚合。Events, gigs and markets happening in ${city.en}, New Zealand.`,
  };
}

async function loadEvents(sp: Record<string, string | string[] | undefined>) {
  const parsed = eventQuerySchema.safeParse({
    city: typeof sp.city === "string" ? sp.city : "auckland",
    venue: typeof sp.venue === "string" ? sp.venue : undefined,
    date: typeof sp.date === "string" ? sp.date : typeof sp.venue === "string" ? "all" : "week",
    category: typeof sp.category === "string" ? sp.category : undefined,
    limit: 200,
  });
  if (!parsed.success) notFound();
  const query = parsed.data;

  return { events: venueSnapshotEvents(query), query };
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { events, query } = await loadEvents(sp);

  return (
    <>
      <Shell
        initialEvents={events as KiwiEvent[]}
        initialCity={String(query.city ?? "auckland")}
        initialDate={String(query.date)}
        initialCategory={query.category ? String(query.category) : null}
        initialVenue={query.venue ? String(query.venue) : null}
        venues={snapshot.venues.map(({ slug, name }) => ({ slug, name }))}
      />
      {/* Crawlable plain-text index. The interactive shell is client-side; this
          is what a JS-less crawler (and a screen reader jumping by heading)
          actually reads. */}
      <noscript>
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              <a href={e.sourceUrl}>{e.title}</a> — {e.startsAt.toISOString()} — {e.venue?.name ?? ""}
            </li>
          ))}
        </ul>
      </noscript>
    </>
  );
}

export async function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}
