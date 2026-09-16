/**
 * Tiny locale shim. Deliberately not an i18n framework: the surface is small,
 * and this keeps the strings in one greppable file that the Expo app can import
 * verbatim when it arrives.
 */
export type Locale = "zh" | "en";

export const STRINGS = {
  zh: {
    brand: "Kiwi Local",
    tagline: "新西兰本地活动",
    viewList: "列表", viewSplit: "分屏", viewMap: "地图",
    allCategories: "全部分类", allDates: "全部日期",
    free: "免费", heat: "热力图", reset: "重置视野",
    empty: "该筛选条件下暂无活动，试试切换日期或城市。",
    eventsIn: (n: number, city: string) => `${city} · ${n} 场活动`,
    sources: (n: number) => `${n} 个来源`,
    viewSource: "查看原始页面",
    loadMore: "加载更多",
    loading: "加载中…",
    error: "加载失败，请重试",
  },
  en: {
    brand: "Kiwi Local",
    tagline: "What's on in New Zealand",
    viewList: "List", viewSplit: "Split", viewMap: "Map",
    allCategories: "All categories", allDates: "All dates",
    free: "Free", heat: "Heatmap", reset: "Reset view",
    empty: "Nothing matches these filters — try another date or city.",
    eventsIn: (n: number, city: string) => `${n} events in ${city}`,
    sources: (n: number) => `${n} sources`,
    viewSource: "View original listing",
    loadMore: "Load more",
    loading: "Loading…",
    error: "Could not load events",
  },
} as const;

export function t(locale: Locale) {
  return STRINGS[locale];
}
