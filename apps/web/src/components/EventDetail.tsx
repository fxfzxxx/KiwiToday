"use client";

import Image from "next/image";
import type { VenueSnapshot } from "@kiwi/core";
import { useLocale } from "./LocaleProvider";

type DetailEvent = VenueSnapshot["events"][number];
type DetailVenue = VenueSnapshot["venues"][number] | undefined;

export function EventDetail({
  event, venue, snapshotGeneratedAt,
}: {
  event: DetailEvent;
  venue: DetailVenue;
  snapshotGeneratedAt: string;
}) {
  const { locale, toggleLocale } = useLocale();
  const isChinese = locale === "zh";
  const venueName = venue?.name ?? (isChinese ? "场馆活动" : "Venue events");
  const dateLabel = event.endDate && event.endDate !== event.date
    ? `${event.date} ${isChinese ? "至" : "to"} ${event.endDate}`
    : event.date;
  const checked = new Intl.DateTimeFormat(isChinese ? "zh-CN" : "en-NZ", {
    timeZone: "Pacific/Auckland", year: "numeric", month: "long", day: "numeric",
  }).format(new Date(event.checkedAt));
  const summary = event.summary ?? (isChinese
    ? `${venueName}即将举行这项活动。具体场次、票价、入场要求及取消或改期信息请查看活动官网。`
    : `This event is coming up at ${venueName}. Check the official website for sessions, pricing, entry requirements, and any changes or cancellations.`);
  const snapshotDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(snapshotGeneratedAt));
  const upcomingSessions = event.sessionDates?.filter((date) => date >= snapshotDay) ?? [];

  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b border-line bg-white/90 backdrop-blur">
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <a href="/" aria-label="KiwiToday" className="flex items-center gap-2">
          <Image src="/brand/kiwitoday-logo-light.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
          <span className="text-[17px] font-bold tracking-tight hover:text-coral">KiwiToday</span>
        </a>
        <span className="h-7 w-px bg-line" aria-hidden="true" />
        <span className="truncate text-[13px] font-medium text-ink-soft">{venueName}</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-5 sm:pt-7">
      <div className="mb-3 flex items-center justify-between">
        <a href={`/?venue=${event.venueSlug}`} className="text-[12px] font-semibold text-coral hover:text-coral/80">
          {isChinese ? "← 返回活动列表" : "← Back to events"}
        </a>
        <button
          type="button"
          onClick={toggleLocale}
          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium transition hover:border-ink/30"
        >
          {isChinese ? "EN" : "中文"}
        </button>
      </div>
      <article className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className={`relative ${event.imageUrl ? "min-h-[260px] sm:min-h-[410px]" : "min-h-[220px] bg-sea"}`}>
          {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-coral">{venue?.name ?? "Auckland"}</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{event.title}</h1>
          </div>
        </div>
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-coral">{isChinese ? "活动简介" : "About this event"}</p>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-8 text-ink sm:text-base">{summary}</p>
            {upcomingSessions.length > 0 && <div className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-semibold">{isChinese ? "官网已公布的近期场次" : "Upcoming sessions listed by the venue"}</h2>
              <div className="mt-3 flex flex-wrap gap-2">{upcomingSessions.slice(0, 10).map((date) => <span key={date} className="rounded-full border border-line bg-paper px-3 py-1.5 text-[12px]">{new Intl.DateTimeFormat(isChinese ? "zh-CN" : "en-NZ", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00Z`))}</span>)}</div>
              {upcomingSessions.length > 10 && <p className="mt-3 text-[12px] text-ink-soft">{isChinese ? `另有 ${upcomingSessions.length - 10} 个已公布场次，请以官网最新安排为准。` : `${upcomingSessions.length - 10} more listed sessions. Check the official website for the latest schedule.`}</p>}
            </div>}
          </section>
          <aside className="rounded-xl border border-line bg-paper p-5">
            <dl className="space-y-5 text-sm">
              <div><dt className="text-[11px] text-ink-soft">{isChinese ? "日期" : "Date"}</dt><dd className="mt-1 font-semibold">{dateLabel}</dd></div>
              {event.scheduleText && <div><dt className="text-[11px] text-ink-soft">{isChinese ? "举行规律／时间" : "Schedule / time"}</dt><dd className="mt-1 font-semibold leading-6">{event.scheduleText}</dd></div>}
              {event.precision === "time" && event.startsAt && <div><dt className="text-[11px] text-ink-soft">{isChinese ? "时间" : "Time"}</dt><dd className="mt-1 font-semibold">{new Intl.DateTimeFormat(isChinese ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</dd></div>}
              <div><dt className="text-[11px] text-ink-soft">{isChinese ? "场馆" : "Venue"}</dt><dd className="mt-1 font-semibold">{venueName}</dd></div>
              <div><dt className="text-[11px] text-ink-soft">{isChinese ? "资料核验" : "Last checked"}</dt><dd className="mt-1">{checked}</dd></div>
            </dl>
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-between rounded-lg bg-coral px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-coral/90">{isChinese ? "查看官网与票务" : "Official website and tickets"}<span aria-hidden="true">↗</span></a>
          </aside>
        </div>
      </article>
      <p className="mt-5 text-[11px] leading-5 text-ink-soft">{isChinese ? "活动日期、票价、入场要求及取消／改期请以主办方官网为准。" : "Check the organizer's website for dates, prices, entry requirements, and cancellations or rescheduling."}</p>
    </main>
  </div>;
}