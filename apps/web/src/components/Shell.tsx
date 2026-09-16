"use client";

import {
  CATEGORIES, CITIES, DATE_BUCKETS, getCity, type KiwiEvent,
} from "@kiwi/core";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EventCard } from "./EventCard";
import { t, type Locale } from "@/lib/i18n";

// MapLibre touches `window` at import time, so it must not be server-rendered.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line/40" />,
});

type View = "list" | "split" | "map";

export function Shell({
  initialEvents, initialCity, initialDate, initialCategory, demo,
}: {
  initialEvents: KiwiEvent[];
  initialCity: string;
  initialDate: string;
  initialCategory: string | null;
  demo: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("split");
  const [city, setCity] = useState(initialCity);
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [freeOnly, setFreeOnly] = useState(false);
  const [showHeat, setShowHeat] = useState(false);

  const [events, setEvents] = useState<KiwiEvent[]>(initialEvents);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(demo);

  const copy = t(locale);
  const cityInfo = getCity(city);

  // Abort in-flight requests when filters change again quickly, so a slow
  // earlier response cannot overwrite a newer one.
  const inflight = useRef<AbortController | null>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setStatus("loading");

    const params = new URLSearchParams({ city, date, limit: "60" });
    if (category) params.set("category", category);
    if (freeOnly) params.set("free", "true");

    try {
      const res = await fetch(`/api/events?${params}`, { signal: ctl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events: KiwiEvent[]; demo?: boolean };
      setEvents(data.events.map((e) => ({ ...e, startsAt: new Date(e.startsAt) })));
      setIsDemo(Boolean(data.demo));
      setStatus("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
    }
  }, [city, date, category, freeOnly]);

  useEffect(() => {
    // The server already rendered the initial filter set; refetching it on
    // mount would be a wasted round trip and a visible flash.
    if (first.current) { first.current = false; return; }
    void load();

    // Keep the URL shareable and crawlable without forcing a full navigation.
    const params = new URLSearchParams({ city, date });
    if (category) params.set("category", category);
    startTransition(() => router.replace(`/?${params}`, { scroll: false }));
  }, [load, city, date, category, router]);

  const visible = useMemo(
    () => (freeOnly ? events.filter((e) => e.isFree) : events),
    [events, freeOnly],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="z-20 shrink-0 border-b border-line bg-white/85 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tracking-tight">{copy.brand}</span>
            <span className="hidden text-[12px] text-ink-soft sm:inline">{copy.tagline}</span>
          </div>

          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label={locale === "zh" ? "选择城市" : "Select city"}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] font-medium"
          >
            {CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>{locale === "zh" ? c.zh : c.en}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setLocale((l) => (l === "zh" ? "en" : "zh"))}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium"
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            <div role="tablist" className="flex overflow-hidden rounded-lg border border-line">
              {(["list", "split", "map"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1.5 text-[12px] font-medium ${view === v ? "bg-ink text-white" : "bg-white"}`}
                >
                  {v === "list" ? copy.viewList : v === "split" ? copy.viewSplit : copy.viewMap}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pb-2.5">
          <ChipGroup
            items={DATE_BUCKETS.map((b) => ({ value: b.slug, label: locale === "zh" ? b.zh : b.en }))}
            value={date}
            onChange={setDate}
          />
          <span className="w-px shrink-0 self-stretch bg-line" />
          <ChipGroup
            items={[
              { value: "", label: copy.allCategories },
              ...CATEGORIES.map((c) => ({ value: c.slug, label: locale === "zh" ? c.zh : c.en })),
            ]}
            value={category ?? ""}
            onChange={(v) => setCategory(v || null)}
          />
          <span className="w-px shrink-0 self-stretch bg-line" />
          <Chip active={freeOnly} onClick={() => setFreeOnly((f) => !f)}>{copy.free}</Chip>
          {view !== "list" ? (
            <Chip active={showHeat} onClick={() => setShowHeat((h) => !h)}>{copy.heat}</Chip>
          ) : null}
        </div>

        {isDemo ? (
          <p className="bg-coral/10 px-4 py-1.5 text-[12px] text-ink">
            {locale === "zh"
              ? "演示数据 — 设置 DATABASE_URL 并运行 pnpm ingest 后即为真实活动。"
              : "Demo data — set DATABASE_URL and run pnpm ingest to see real events."}
          </p>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1">
        <section
          className={`min-h-0 overflow-y-auto ${
            view === "map" ? "hidden" : view === "list" ? "w-full" : "w-full max-w-[460px] shrink-0"
          }`}
        >
          <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
            <h1 className="text-[15px] font-semibold">
              {copy.eventsIn(visible.length, locale === "zh" ? (cityInfo?.zh ?? city) : (cityInfo?.en ?? city))}
            </h1>
            {status === "loading" ? <span className="text-[12px] text-ink-soft">{copy.loading}</span> : null}
          </div>

          {status === "error" ? (
            <p className="px-4 py-8 text-center text-[13px] text-coral">{copy.error}</p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-ink-soft">{copy.empty}</p>
          ) : (
            <div className={`grid gap-3 px-4 pb-8 ${view === "list" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : ""}`}>
              {visible.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  locale={locale}
                  active={e.id === activeId}
                  onSelect={setActiveId}
                  onHover={setHoveredId}
                />
              ))}
            </div>
          )}
        </section>

        <section className={`min-h-0 flex-1 ${view === "list" ? "hidden" : ""}`}>
          <MapView
            events={visible}
            activeId={activeId}
            hoveredId={hoveredId}
            showHeat={showHeat}
            city={city}
            onSelect={setActiveId}
          />
        </section>
      </main>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium transition
        ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`}
    >
      {children}
    </button>
  );
}

function ChipGroup({
  items, value, onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {items.map((item) => (
        <Chip key={item.value} active={value === item.value} onClick={() => onChange(item.value)}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
