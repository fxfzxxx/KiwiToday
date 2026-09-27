"use client";

import { CATEGORIES, formatWhen, type KiwiEvent } from "@kiwi/core";
import type { Locale } from "@/lib/i18n";

/** Deterministic placeholder until cover images are proxied through R2. */
function placeholderStyle(id: string): React.CSSProperties {
  const PAIRS = [["#0B6E99", "#0E80B0"], ["#1E8A5F", "#25A472"], ["#08415C", "#0B6E99"],
                 ["#FF6B4A", "#FF8B6E"], ["#146E7E", "#1E8A5F"], ["#0B6E99", "#1E8A5F"]];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PAIRS[h % PAIRS.length]!;
  return {
    backgroundColor: a,
    backgroundImage: `repeating-linear-gradient(135deg, ${b} 0 2px, transparent 2px 9px)`,
  };
}

function compactSchedule(value: string | undefined): string | null {
  if (!value) return null;
  const range = /(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:to|[–-])\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.exec(value);
  if (range) return `${range[1]!.replace(/\s+/g, "")}–${range[2]!.replace(/\s+/g, "")}`;
  return value.length <= 40 ? value : null;
}

export function EventCard({
  event, locale, active, onSelect, onHover,
}: {
  event: KiwiEvent;
  locale: Locale;
  active: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const category = CATEGORIES.find((c) => c.slug === event.category);
  const title = locale === "zh" ? (event.titleZh ?? event.title) : event.title;
  const when = event.dateOnly
    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", month: "short", day: "numeric" }).format(new Date(event.startsAt))
    : formatWhen(new Date(event.startsAt), { locale });
  const schedule = compactSchedule(event.scheduleText);
  const tags = [
    locale === "zh" ? category?.zh : category?.en,
    event.isFree ? (locale === "zh" ? "免费" : "Free") : null,
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <article
      onClick={() => onSelect(event.id)}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      className={`group cursor-pointer overflow-hidden rounded-xl border bg-white transition
        ${active ? "border-coral shadow-md" : "border-line hover:border-ink/25 hover:shadow-sm"}`}
    >
      <div className="relative h-32 w-full" style={placeholderStyle(event.id)}>
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote hosts are unbounded until images move to R2
          <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug"><a href={event.detailUrl ?? event.sourceUrl} onClick={(click) => click.stopPropagation()}>{title}</a></h3>
        <div className="flex flex-wrap gap-1.5" aria-label={locale === "zh" ? "活动标签" : "Event tags"}>
          {tags.map((tag, index) => <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${index === 0 ? "bg-ink/10 text-ink" : "bg-moss/10 text-moss"}`}>{tag}</span>)}
        </div>
        <dl className="space-y-1 text-[12px] text-ink-soft">
          <div className="flex gap-1.5">
            <dt className="sr-only">{locale === "zh" ? "时间" : "When"}</dt>
            <dd>{when}{schedule ? ` · ${schedule}` : ""}</dd>
          </div>
          {event.venue?.name ? (
            <div className="flex gap-1.5">
              <dt className="sr-only">{locale === "zh" ? "地点" : "Where"}</dt>
              <dd className="line-clamp-1">{event.venue.name}</dd>
            </div>
          ) : null}
        </dl>
        {event.sourceName !== event.venue?.name || event.sourceCount > 1 ? <div className="flex items-center justify-between pt-1 text-[11px] text-ink-soft">
          <span>{event.sourceName !== event.venue?.name ? event.sourceName : ""}</span>
          {/* More sources carrying an event is our best available proxy for how
              big it is, until we have engagement of our own. */}
          {event.sourceCount > 1 ? (
            <span className="rounded bg-paper px-1.5 py-0.5">{event.sourceCount} sources</span>
          ) : null}
        </div> : null}
        <a
          href={event.detailUrl ?? event.sourceUrl}
          onClick={(click) => click.stopPropagation()}
          className="flex items-center justify-between rounded-lg border border-coral/30 px-3 py-2 text-[12px] font-semibold text-coral transition hover:border-coral hover:bg-coral/5"
        >
          <span>{locale === "zh" ? "查看详细信息" : "View details"}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  );
}
