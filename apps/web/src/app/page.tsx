import { CITIES, eventQuerySchema, getCity, type KiwiEvent } from "@kiwi/core";
import { findEvents } from "@kiwi/db";
import type { Metadata } from "next";
import { SAMPLE_EVENTS } from "@/lib/sample";
import { filterSample } from "@/lib/filter-sample";
import { Shell } from "@/components/Shell";

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
  return {
    title: `${city.zh}本地活动 · What's on in ${city.en}`,
    description: `${city.zh}近期的市集、演出、户外与赛事聚合。Events, gigs and markets happening in ${city.en}, New Zealand.`,
  };
}

async function loadEvents(sp: Record<string, string | string[] | undefined>) {
  const query = eventQuerySchema.parse({
    city: typeof sp.city === "string" ? sp.city : "auckland",
    date: typeof sp.date === "string" ? sp.date : "week",
    category: typeof sp.category === "string" ? sp.category : undefined,
    limit: 60,
  });

  if (!process.env.DATABASE_URL) {
    return { events: filterSample(SAMPLE_EVENTS, query), demo: true, query };
  }
  try {
    const { events } = await findEvents(query);
    return { events, demo: false, query };
  } catch (err) {
    console.error("SSR findEvents failed, falling back to demo data", err);
    return { events: filterSample(SAMPLE_EVENTS, query), demo: true, query };
  }
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { events, demo, query } = await loadEvents(sp);

  return (
    <>
      <Shell
        initialEvents={events as KiwiEvent[]}
        initialCity={String(query.city ?? "auckland")}
        initialDate={String(query.date)}
        initialCategory={query.category ? String(query.category) : null}
        demo={demo}
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
