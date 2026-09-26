import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import type { VenueSnapshot } from "@kiwi/core";
import snapshotData from "@/data/venue-snapshot.json";

const snapshot = snapshotData as VenueSnapshot;

export function generateStaticParams() {
  return snapshot.events.map((event) => ({ id: event.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = snapshot.events.find((item) => item.id === id);
  return event ? { title: `${event.title} · KiwiToday`, description: event.summary ?? `${event.title} 活动详情` } : {};
}

export default async function VenueEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = snapshot.events.find((item) => item.id === id);
  if (!event) notFound();
  const venue = snapshot.venues.find((item) => item.slug === event.venueSlug);
  const dateLabel = event.endDate && event.endDate !== event.date ? `${event.date} 至 ${event.endDate}` : event.date;
  const checked = new Intl.DateTimeFormat("zh-CN", { timeZone: "Pacific/Auckland", year: "numeric", month: "long", day: "numeric" }).format(new Date(event.checkedAt));
  const summary = event.summary ?? `${venue?.name ?? "该场馆"}即将举行这项活动。具体场次、票价、入场要求及取消或改期信息请查看活动官网。`;
  const snapshotDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(snapshot.generatedAt));
  const upcomingSessions = event.sessionDates?.filter((date) => date >= snapshotDay) ?? [];

  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b border-line bg-white/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2.5"><a href="/" aria-label="返回 KiwiToday 首页" className="flex items-center gap-2"><Image src="/brand/kiwitoday-logo-light.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" /><span className="text-[17px] font-bold tracking-tight hover:text-coral">KiwiToday</span></a><span className="hidden text-[12px] text-ink-soft sm:inline">新西兰本地活动</span></div>
        <span className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] font-medium">Auckland</span>
        <a href="/" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium transition hover:border-ink/30">活动地图</a>
        <a href={`/?venue=${event.venueSlug}`} className="rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-medium text-white">{venue?.name ?? "场馆活动"}</a>
        <a href={`/?venue=${event.venueSlug}`} className="ml-auto text-[12px] font-medium text-coral">← 返回活动列表</a>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-5 sm:pt-7">
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
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-coral">活动简介</p>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-8 text-ink sm:text-base">{summary}</p>
            {upcomingSessions.length > 0 && <div className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-semibold">官网已公布的近期场次</h2>
              <div className="mt-3 flex flex-wrap gap-2">{upcomingSessions.slice(0, 10).map((date) => <span key={date} className="rounded-full border border-line bg-paper px-3 py-1.5 text-[12px]">{new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00Z`))}</span>)}</div>
              {upcomingSessions.length > 10 && <p className="mt-3 text-[12px] text-ink-soft">另有 {upcomingSessions.length - 10} 个已公布场次，请以官网最新安排为准。</p>}
            </div>}
          </section>
          <aside className="rounded-xl border border-line bg-paper p-5">
            <dl className="space-y-5 text-sm">
              <div><dt className="text-[11px] text-ink-soft">日期</dt><dd className="mt-1 font-semibold">{dateLabel}</dd></div>
              {event.scheduleText && <div><dt className="text-[11px] text-ink-soft">举行规律／时间</dt><dd className="mt-1 font-semibold leading-6">{event.scheduleText}</dd></div>}
              {event.precision === "time" && event.startsAt && <div><dt className="text-[11px] text-ink-soft">时间</dt><dd className="mt-1 font-semibold">{new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</dd></div>}
              <div><dt className="text-[11px] text-ink-soft">场馆</dt><dd className="mt-1 font-semibold">{venue?.name ?? event.venueSlug}</dd></div>
              <div><dt className="text-[11px] text-ink-soft">资料核验</dt><dd className="mt-1">{checked}</dd></div>
            </dl>
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-between rounded-lg bg-coral px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-coral/90">查看官网与票务<span aria-hidden="true">↗</span></a>
          </aside>
        </div>
      </article>
      <p className="mt-5 text-[11px] leading-5 text-ink-soft">活动日期、票价、入场要求及取消／改期请以主办方官网为准。</p>
    </main>
  </div>;
}
