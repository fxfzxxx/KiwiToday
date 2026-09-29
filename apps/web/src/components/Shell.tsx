"use client";

import {
  CATEGORIES, CITIES, DATE_BUCKETS, getCity, type KiwiEvent,
} from "@kiwi/core";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EventCard } from "./EventCard";
import { useLocale } from "./LocaleProvider";
import { t, type Locale } from "@/lib/i18n";

// MapLibre touches `window` at import time, so it must not be server-rendered.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line/40" />,
});

type View = "list" | "split" | "map";
const FILTER_CATEGORIES = CATEGORIES.filter((category) => category.slug !== "water");

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

  const { locale, toggleLocale } = useLocale();
  const [view, setView] = useState<View>("split");
  const [city, setCity] = useState(initialCity);
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [venue, setVenue] = useState<string | null>(initialVenue);
  const [freeOnly, setFreeOnly] = useState(false);

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

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1023px)");
    const applyViewport = () => {
      if (mobile.matches) setView((current) => current === "split" ? "list" : current);
    };
    applyViewport();
    mobile.addEventListener("change", applyViewport);
    return () => mobile.removeEventListener("change", applyViewport);
  }, []);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setStatus("loading");

    const params = new URLSearchParams({ city, date, limit: "200" });
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
  const venueChips = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const event of visible) {
      if (!event.venue) continue;
      const current = counts.get(event.venue.id);
      if (current) current.count += 1;
      else counts.set(event.venue.id, { name: event.venue.name, count: 1 });
    }
    return [...counts.entries()]
      .map(([slug, item]) => ({ slug, ...item }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [visible]);
  const selectedVenue = venues.find((item) => item.slug === venue);
  const placeName = selectedVenue?.name ?? (locale === "zh" ? (cityInfo?.zh ?? city) : (cityInfo?.en ?? city));
  const exactDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";

  return (
    <div className={`flex flex-col ${view === "list" ? "min-h-screen" : "h-screen"}`}>
      <header className="z-20 shrink-0 border-b border-line bg-white/95 shadow-[0_1px_8px_rgba(8,65,92,0.04)] backdrop-blur">
        <div className="flex min-h-14 items-center gap-4 px-4 py-2.5 lg:px-6">
          <div className="flex shrink-0 items-baseline gap-2">
            <a href="/" aria-label="返回 KiwiToday 首页" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-sea/40">
              <Image src="/brand/kiwitoday-logo-light.png" alt="" width={40} height={40} priority className="h-10 w-10 shrink-0 rounded-lg" />
              <span className="hidden text-[19px] font-bold tracking-[-0.03em] text-ink sm:inline">{copy.brand}</span>
            </a>
            <span className="hidden text-[11px] text-ink-soft xl:inline">{copy.tagline}</span>
          </div>
          <div className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-ink-soft">{locale === "zh" ? "当前活动范围" : "Current event area"}</p>
            <p className="truncate text-[14px] font-semibold text-ink">{placeName}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleLocale}
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
                  className={`${v === "split" ? "split-view-tab " : ""}rounded-md px-2.5 py-1 text-[12px] font-medium transition ${view === v ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
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
              setCity(nextCity);
              if (venue) setVenue(null);
            }} aria-label={locale === "zh" ? "选择城市" : "Select city"} className="h-9 rounded-lg border border-line bg-white px-3 text-[12px] font-semibold outline-none focus:border-sea">
              {CITIES.map((item) => <option key={item.slug} value={item.slug}>{locale === "zh" ? item.zh : item.en}</option>)}
            </select>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <VenuePicker
                venues={venues}
                value={venue}
                locale={locale}
                onSelect={setVenue}
              />
              <DatePicker value={exactDate} locale={locale} onSelect={setDate} />
            </div>
            <span className="hidden h-6 w-px bg-line md:block" />
            <div className="flex max-w-full flex-wrap items-center gap-1.5" aria-label={locale === "zh" ? "日期范围" : "Date range"}>
              <ChipGroup items={DATE_BUCKETS.map((bucket) => ({ value: bucket.slug, label: locale === "zh" ? bucket.zh : bucket.en }))} value={date} onChange={setDate} wrap />
            </div>
            <div className="ml-auto flex gap-1.5">
              <Chip active={freeOnly} onClick={() => setFreeOnly((free) => !free)}>{copy.free}</Chip>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
            <span className="w-full shrink-0 text-[10px] font-semibold uppercase tracking-[.14em] text-ink-soft sm:w-auto">{locale === "zh" ? "分类" : "Categories"}</span>
            <ChipGroup items={[{ value: "", label: copy.allCategories }, ...FILTER_CATEGORIES.map((item) => ({ value: item.slug, label: locale === "zh" ? item.zh : item.en }))]} value={category ?? ""} onChange={(value) => setCategory(value || null)} wrap compact />
          </div>
        </div>

      </header>

      <main className={`flex ${view === "list" ? "flex-none" : "min-h-0 flex-1"} ${view === "split" ? "split-layout" : ""}`}>
        <section
          className={`${view === "list" ? "w-full overflow-visible" : "min-h-0 overflow-y-auto"} ${view === "map" ? "hidden" : view === "list" ? "w-full" : "split-events"
            }`}
        >
          <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
            <h1 className="text-[15px] font-semibold">
              {copy.eventsIn(visible.length, placeName)}
            </h1>
            {status === "loading" ? <span className="text-[12px] text-ink-soft">{copy.loading}</span> : null}
          </div>
          {venueChips.length > 0 ? (
            <div className="flex max-w-full flex-wrap items-center gap-2 px-4 pb-3" aria-label={locale === "zh" ? "按地点筛选" : "Filter by venue"}>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.12em] text-ink-soft">{locale === "zh" ? "地点" : "Venues"}</span>
              <ChipGroup
                items={[
                  { value: "", label: `${locale === "zh" ? "全部地点" : "All venues"} (${visible.length})` },
                  ...venueChips.map((item) => ({ value: item.slug, label: `${item.name} (${item.count})` })),
                ]}
                value={venue ?? ""}
                onChange={(value) => setVenue(value || null)}
                wrap
                compact
              />
            </div>
          ) : null}

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

        <section className={`min-h-0 flex-1 ${view === "list" ? "hidden" : view === "split" ? "split-map" : ""}`}>
          <MapView
            events={visible}
            activeId={activeId}
            hoveredId={hoveredId}
            city={city}
            onSelect={setActiveId}
          />
        </section>
      </main>
    </div>
  );
}

function Chip({ active, onClick, children, compact = false }: { active: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border ${compact ? "px-2 py-1 text-[11px] sm:px-2.5 sm:text-[12px]" : "px-3 py-1 text-[12px]"} font-medium transition
        ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`}
    >
      {children}
    </button>
  );
}

function ChipGroup({
  items, value, onChange, wrap = false, compact = false,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  wrap?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex ${compact ? "gap-1" : "gap-1.5"} ${wrap ? "min-w-0 max-w-full flex-wrap" : "shrink-0"}`}>
      {items.map((item) => (
        <Chip key={item.value} active={value === item.value} onClick={() => onChange(item.value)} compact={compact}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}

function DatePicker({ value, locale, onSelect }: {
  value: string;
  locale: Locale;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = value ? value.split("-").map(Number) : [];
    const initial = value ? new Date(year!, month! - 1, 1) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const root = useRef<HTMLDivElement>(null);
  const isChinese = locale === "zh";
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const weekdays = isChinese ? ["一", "二", "三", "四", "五", "六", "日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const selectedLabel = value
    ? new Intl.DateTimeFormat(isChinese ? "zh-CN" : "en-NZ", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`))
    : null;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function openCalendar() {
    if (value) {
      const [selectedYear, selectedMonth] = value.split("-").map(Number);
      setVisibleMonth(new Date(selectedYear!, selectedMonth! - 1, 1));
    }
    setOpen((current) => !current);
  }

  function selectDay(day: number) {
    const selected = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onSelect(selected);
    setOpen(false);
  }

  return (
    <div ref={root} className="relative z-30 shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openCalendar}
        className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[12px] font-medium transition focus:outline-none focus:ring-2 focus:ring-sea/10 ${value ? "border-sea bg-sea/5 text-ink" : "border-line bg-white text-ink-soft hover:border-ink/30"}`}
      >
        <span>{selectedLabel ?? (isChinese ? "选择日期" : "Pick a date")}</span>
        <span aria-hidden="true" className="text-[11px]">▦</span>
      </button>
      {open ? (
        <div role="dialog" aria-label={isChinese ? "选择日期" : "Choose a date"} className="absolute left-0 top-full mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-3 shadow-[0_16px_40px_rgba(8,65,92,0.16)]">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label={isChinese ? "上个月" : "Previous month"} onClick={() => setVisibleMonth(new Date(year, month - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-paper hover:text-ink">←</button>
            <h2 className="text-[13px] font-semibold text-ink">{new Intl.DateTimeFormat(isChinese ? "zh-CN" : "en-NZ", { year: "numeric", month: "long" }).format(visibleMonth)}</h2>
            <button type="button" aria-label={isChinese ? "下个月" : "Next month"} onClick={() => setVisibleMonth(new Date(year, month + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-paper hover:text-ink">→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((weekday) => <span key={weekday} className="py-1 text-[10px] font-medium text-ink-soft">{weekday}</span>)}
            {days.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />;
              const dayValue = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = value === dayValue;
              const today = new Date();
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
              return <button key={dayValue} type="button" aria-pressed={isSelected} onClick={() => selectDay(day)} className={`aspect-square rounded-lg text-[12px] transition ${isSelected ? "bg-sea text-white" : isToday ? "border border-sea/40 text-sea hover:bg-sea/10" : "text-ink hover:bg-paper"}`}>{day}</button>;
            })}
          </div>
          {value ? <button type="button" onClick={() => { onSelect("week"); setOpen(false); }} className="mt-3 w-full border-t border-line pt-2.5 text-left text-[11px] font-medium text-coral hover:text-coral/80">{isChinese ? "清除具体日期" : "Clear exact date"}</button> : null}
        </div>
      ) : null}
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
    <div ref={root} className="relative z-30 min-w-0 flex-1 sm:w-64">
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
