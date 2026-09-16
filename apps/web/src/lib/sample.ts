import type { KiwiEvent } from "@kiwi/core";

/**
 * Demo rows so `pnpm dev` renders something before you have a database or an
 * Eventfinda key. The API falls back to these and flags `demo: true` in the
 * response so it is obvious you are not looking at real data.
 */
const MS = 3600_000;
const soon = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * MS);

function demo(
  id: string, title: string, titleZh: string, category: string,
  hours: number, venue: string, lat: number, lng: number, city: string,
  popularity: number, isFree = false,
): KiwiEvent {
  return {
    id, title, titleZh, summary: null, summaryZh: null, category,
    startsAt: soon(hours), endsAt: null, isFree, priceFrom: isFree ? null : 45,
    currency: "NZD", citySlug: city, coverImageUrl: null,
    sourceUrl: "https://www.eventfinda.co.nz/", sourceName: "demo",
    sourceCount: 1, popularity,
    point: { lat, lng },
    venue: { id: `v-${id}`, name: venue, address: null, citySlug: city, point: { lat, lng } },
  };
}

export const SAMPLE_EVENTS: KiwiEvent[] = [
  demo("d1", "Silo Park Friday Night Market", "Silo Park 周五夜市", "market", 5, "Silo Park", -36.8420, 174.7554, "auckland", 1284, true),
  demo("d2", "SIX60 — Auckland", "Six60 巡演 · 奥克兰场", "music", 7, "Spark Arena", -36.8476, 174.7842, "auckland", 3120),
  demo("d3", "Rangitoto Summit Sunset Hike", "朗伊托托火山口日落徒步", "outdoor", 3, "Rangitoto Island", -36.7870, 174.8600, "auckland", 864),
  demo("d4", "Mission Bay Paddleboard Morning", "Mission Bay 桨板日", "water", 22, "Mission Bay", -36.8497, 174.8285, "auckland", 512, true),
  demo("d5", "All Blacks v Australia", "全黑队 vs 澳洲", "sports", 50, "Eden Park", -36.8748, 174.7449, "auckland", 4210),
  demo("d6", "NZSO: Dvořák No. 9", "NZSO 交响夜：德沃夏克第九", "arts", 28, "Aotea Centre", -36.8524, 174.7635, "auckland", 620),
  demo("d7", "Cornwall Park Picnic Day", "康沃尔公园野餐日", "family", 30, "Cornwall Park", -36.8935, 174.7826, "auckland", 398, true),
  demo("d8", "Wellington Beats", "惠灵顿电音夜", "music", 9, "TSB Arena", -41.2856, 174.7806, "wellington", 880),
  demo("d9", "Zealandia Night Walk", "Zealandia 夜行观鸟", "outdoor", 8, "Zealandia", -41.2943, 174.7482, "wellington", 730),
  demo("d10", "Arrowtown Autumn Market", "箭镇秋色手作市集", "market", 54, "Arrowtown", -44.9400, 168.8300, "queenstown", 455, true),
  demo("d11", "Lake Wakatipu Sailing", "瓦卡蒂普湖帆船体验", "water", 31, "Lake Wakatipu", -45.0330, 168.6620, "queenstown", 289),
  demo("d12", "Huka Falls Trail Run", "胡卡瀑布步道越野跑", "outdoor", 27, "Huka Falls", -38.6490, 176.0900, "taupo", 210, true),
];
