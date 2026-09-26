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
  initialEvents, initialCity, initialDate, initialCategory, initialVenue, venues,
}: {
  initialEvents: KiwiEvent[];
  initialCity: string;
  initialDate: string;
  initialCategory: string | null;
  initialVenue: string | null;
  venues: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [locale, setLocale] = useState<Locale>("zh");
  const [view, setView] = useState<View>("split");
  const [city, setCity] = useState(initialCity);
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [venue] = useState<string | null>(initialVenue);
  const [freeOnly, setFreeOnly] = useState(false);
  const [showHeat, setShowHeat] = useState(false);

  const [events, setEvents] = useState<KiwiEvent[]>(initialEvents);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    if (venue) params.set("venue", venue);
    if (category) params.set("category", category);
    if (freeOnly) params.set("free", "true");

    try {
      const res = await fetch(`/api/events?${params}`, { signal: ctl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events: KiwiEvent[] };
      setEvents(data.events.map((e) => ({ ...e, startsAt: new Date(e.startsAt) })));
      setStatus("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
    }
  }, [city, date, category, freeOnly, venue]);

  useEffect(() => {
    // The server already rendered the initial filter set; refetching it on
    // mount would be a wasted round trip and a visible flash.
    if (first.current) { first.current = false; return; }
    void load();

    // Keep the URL shareable and crawlable without forcing a full navigation.
    const params = new URLSearchParams({ city, date });
    if (venue) params.set("venue", venue);
    if (category) params.set("category", category);
    startTransition(() => router.replace(`/?${params}`, { scroll: false }));
  }, [load, city, date, category, venue, router]);

  const visible = useMemo(
    () => (freeOnly ? events.filter((e) => e.isFree) : events),
    [events, freeOnly],
  );
  const selectedVenue = venues.find((item) => item.slug === venue);
  const placeName = selectedVenue?.name ?? (locale === "zh" ? (cityInfo?.zh ?? city) : (cityInfo?.en ?? city));

  return (
    <div className="flex h-screen flex-col">
      <header className="z-20 shrink-0 border-b border-line bg-white/95 shadow-[0_1px_8px_rgba(8,65,92,0.04)] backdrop-blur">
        <div className="flex min-h-14 items-center gap-4 px-4 py-2.5 lg:px-6">
          <div className="flex shrink-0 items-baseline gap-2">
            <a href="/" aria-label="返回 KiwiToday 首页" className="text-[19px] font-bold tracking-[-0.03em] text-ink hover:text-coral">{copy.brand}</a>
            <span className="hidden text-[11px] text-ink-soft xl:inline">{copy.tagline}</span>
          </div>
          <div className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-ink-soft">{locale === "zh" ? "当前活动范围" : "Current event area"}</p>
            <p className="truncate text-[14px] font-semibold text-ink">{placeName}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLocale((l) => (l === "zh" ? "en" : "zh"))}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium transition hover:border-ink/30"
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            <div role="tablist" aria-label={locale === "zh" ? "页面视图" : "Page view"} className="flex overflow-hidden rounded-lg border border-line bg-paper p-0.5">
              {(["list", "split", "map"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${view === v ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                >
                  {v === "list" ? copy.viewList : v === "split" ? copy.viewSplit : copy.viewMap}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-line/70 bg-paper/55 px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <select value={city} onChange={(event) => {
              const nextCity = event.target.value;
              if (!venue) { setCity(nextCity); return; }
              const params = new URLSearchParams({ city: nextCity, date });
              if (category) params.set("category", category);
              window.location.assign(`/?${params}`);
            }} aria-label={locale === "zh" ? "选择城市" : "Select city"} className="h-9 rounded-lg border border-line bg-white px-3 text-[12px] font-semibold outline-none focus:border-sea">
              {CITIES.map((item) => <option key={item.slug} value={item.slug}>{locale === "zh" ? item.zh : item.en}</option>)}
            </select>
            <VenuePicker
              venues={venues}
              value={venue}
              locale={locale}
              onSelect={(nextVenue) => {
                const params = new URLSearchParams({ city, date });
                if (category) params.set("category", category);
                if (nextVenue) params.set("venue", nextVenue);
                window.location.assign(`/?${params}`);
              }}
            />
            <span className="hidden h-6 w-px bg-line md:block" />
            <div className="flex max-w-full gap-1.5 overflow-x-auto" aria-label={locale === "zh" ? "日期范围" : "Date range"}>
              <ChipGroup items={DATE_BUCKETS.map((bucket) => ({ value: bucket.slug, label: locale === "zh" ? bucket.zh : bucket.en }))} value={date} onChange={setDate} />
            </div>
            <div className="ml-auto flex gap-1.5">
              <Chip active={freeOnly} onClick={() => setFreeOnly((free) => !free)}>{copy.free}</Chip>
              {view !== "list" ? <Chip active={showHeat} onClick={() => setShowHeat((heat) => !heat)}>{copy.heat}</Chip> : null}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 overflow-x-auto border-t border-line/60 pt-2.5">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.14em] text-ink-soft">{locale === "zh" ? "分类" : "Categories"}</span>
            <ChipGroup items={[{ value: "", label: copy.allCategories }, ...CATEGORIES.map((item) => ({ value: item.slug, label: locale === "zh" ? item.zh : item.en }))]} value={category ?? ""} onChange={(value) => setCategory(value || null)} />
          </div>
        </div>

      </header>

      <main className="flex min-h-0 flex-1">
        <section
          className={`min-h-0 overflow-y-auto ${
            view === "map" ? "hidden" : view === "list" ? "w-full" : "w-full max-w-[460px] shrink-0"
          }`}
        >
          <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
            <h1 className="text-[15px] font-semibold">
              {copy.eventsIn(visible.length, placeName)}
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

function VenuePicker({
  venues, value, locale, onSelect,
}: {
  venues: Array<{ slug: string; name: string }>;
  value: string | null;
  locale: Locale;
  onSelect: (venue: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = venues.find((venue) => venue.slug === value);
  const matches = venues.filter((venue) => venue.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={root} className="relative z-30 w-full sm:w-64">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); setQuery(""); }}
        className={`flex h-9 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-[12px] font-medium transition ${open ? "border-sea ring-2 ring-sea/10" : "border-line hover:border-ink/30"}`}
      >
        <span className="truncate">{selected?.name ?? (locale === "zh" ? "全部场馆" : "All venues")}</span>
        <span className={`text-[10px] text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-11 overflow-hidden rounded-xl border border-line bg-white shadow-[0_16px_40px_rgba(8,65,92,0.16)]">
          <div className="border-b border-line p-2.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
              placeholder={locale === "zh" ? "搜索场馆名称…" : "Search venues…"}
              aria-label={locale === "zh" ? "搜索场馆" : "Search venues"}
              className="h-9 w-full rounded-lg border border-line bg-paper/60 px-3 text-[12px] outline-none placeholder:text-ink-soft/70 focus:border-sea focus:bg-white"
            />
          </div>
          <div role="listbox" aria-label={locale === "zh" ? "场馆列表" : "Venue list"} className="max-h-72 overflow-y-auto p-1.5">
            {!query ? <button type="button" role="option" aria-selected={!value} onClick={() => onSelect(null)} className={`flex w-full rounded-lg px-3 py-2 text-left text-[12px] ${!value ? "bg-ink text-white" : "hover:bg-paper"}`}>{locale === "zh" ? "全部场馆" : "All venues"}</button> : null}
            {matches.map((venue) => (
              <button type="button" role="option" aria-selected={venue.slug === value} key={venue.slug} onClick={() => onSelect(venue.slug)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] ${venue.slug === value ? "bg-ink text-white" : "hover:bg-paper"}`}>
                <span>{venue.name}</span>{venue.slug === value ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
            {!matches.length ? <p className="px-3 py-6 text-center text-[12px] text-ink-soft">{locale === "zh" ? "没有找到匹配场馆" : "No matching venues"}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
