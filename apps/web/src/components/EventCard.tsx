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
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-ink">
          {locale === "zh" ? category?.zh : category?.en}
        </span>
        {event.isFree ? (
          <span className="absolute right-2 top-2 rounded-full bg-moss px-2 py-0.5 text-[11px] font-medium text-white">
            {locale === "zh" ? "免费" : "Free"}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{title}</h3>
        <dl className="space-y-1 text-[12px] text-ink-soft">
          <div className="flex gap-1.5">
            <dt className="sr-only">{locale === "zh" ? "时间" : "When"}</dt>
            <dd>{formatWhen(new Date(event.startsAt), { locale })}</dd>
          </div>
          {event.venue?.name ? (
            <div className="flex gap-1.5">
              <dt className="sr-only">{locale === "zh" ? "地点" : "Where"}</dt>
              <dd className="line-clamp-1">{event.venue.name}</dd>
            </div>
          ) : null}
        </dl>
        <div className="flex items-center justify-between pt-1 text-[11px] text-ink-soft">
          <span>{event.sourceName}</span>
          {/* More sources carrying an event is our best available proxy for how
              big it is, until we have engagement of our own. */}
          {event.sourceCount > 1 ? (
            <span className="rounded bg-paper px-1.5 py-0.5">{event.sourceCount} sources</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
