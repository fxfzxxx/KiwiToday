/**
 * All user-facing date bucketing happens in Pacific/Auckland, regardless of
 * where the server or the reader is. "Tonight" means tonight in NZ.
 *
 * We do this with Intl rather than a date library so the package stays
 * dependency-free and the app bundle does not ship a tz database.
 */
export const NZ_TZ = "Pacific/Auckland";

export const DATE_BUCKETS = [
  { slug: "today",    zh: "今天",     en: "Today" },
  { slug: "tomorrow", zh: "明天",     en: "Tomorrow" },
  { slug: "weekend",  zh: "本周末",   en: "This weekend" },
  { slug: "week",     zh: "未来七天", en: "Next 7 days" },
  { slug: "all",      zh: "全部日期", en: "All dates" },
] as const;

export type DateBucket = (typeof DATE_BUCKETS)[number]["slug"];
export const DATE_BUCKET_SLUGS = DATE_BUCKETS.map((b) => b.slug) as readonly DateBucket[];

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: NZ_TZ,
  hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partsAsUtcMs(instant: Date): number {
  const p = Object.fromEntries(PARTS.formatToParts(instant).map((x) => [x.type, x.value]));
  // Intl renders midnight as hour "24" in some engines; normalise to 0.
  const hour = Number(p.hour) % 24;
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
}

/** Offset of NZ from UTC at `instant`, in ms. Handles NZDT/NZST. */
export function nzOffsetMs(instant: Date): number {
  return partsAsUtcMs(instant) - instant.getTime();
}

/** Y/M/D as seen in Auckland at `instant`. */
export function nzCalendarDate(instant: Date): { year: number; month: number; day: number } {
  const p = Object.fromEntries(PARTS.formatToParts(instant).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/**
 * The UTC instant of local midnight in Auckland, `dayOffset` days from `from`.
 * Two-pass because the offset we need is the one *at the target instant*, which
 * differs from the offset now across a DST boundary.
 */
export function nzStartOfDay(from: Date, dayOffset = 0): Date {
  const { year, month, day } = nzCalendarDate(from);
  const naiveUtc = Date.UTC(year, month - 1, day + dayOffset);
  let guess = new Date(naiveUtc - nzOffsetMs(from));
  guess = new Date(naiveUtc - nzOffsetMs(guess));
  return guess;
}

/** 1 = Monday … 7 = Sunday, as seen in Auckland. */
export function nzWeekday(instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: NZ_TZ, weekday: "short" }).format(instant);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[name] ?? 1;
}

export interface Range { from: Date; to: Date | null }

/**
 * Half-open [from, to). `to === null` means unbounded.
 *
 * "today" starts at `now`, not at midnight — a 9am user should not be offered
 * the 7am parkrun that already finished.
 */
export function bucketToRange(bucket: DateBucket, now: Date = new Date()): Range {
  const startToday = nzStartOfDay(now, 0);
  switch (bucket) {
    case "today":
      return { from: now, to: nzStartOfDay(now, 1) };
    case "tomorrow":
      return { from: nzStartOfDay(now, 1), to: nzStartOfDay(now, 2) };
    case "weekend": {
      const dow = nzWeekday(now);
      // Sat+Sun ahead of us; on Sat/Sun that means the weekend we are already in.
      const toSat = dow >= 6 ? 6 - dow : 6 - dow;
      const satStart = nzStartOfDay(now, toSat);
      const monStart = nzStartOfDay(now, toSat + 2);
      return { from: satStart.getTime() < now.getTime() ? now : satStart, to: monStart };
    }
    case "week":
      return { from: now, to: nzStartOfDay(now, 8) };
    case "all":
      return { from: startToday.getTime() > now.getTime() ? startToday : now, to: null };
  }
}

/** "今天 19:30" / "Sat 14:00" style label for a card. */
export function formatWhen(start: Date, opts: { locale: "zh" | "en"; now?: Date }): string {
  const now = opts.now ?? new Date();
  const time = new Intl.DateTimeFormat(opts.locale === "zh" ? "zh-CN" : "en-NZ", {
    timeZone: NZ_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(start);

  const d0 = nzStartOfDay(now, 0).getTime();
  const d1 = nzStartOfDay(now, 1).getTime();
  const d2 = nzStartOfDay(now, 2).getTime();
  const t = start.getTime();

  if (t >= d0 && t < d1) return opts.locale === "zh" ? `今天 ${time}` : `Today ${time}`;
  if (t >= d1 && t < d2) return opts.locale === "zh" ? `明天 ${time}` : `Tomorrow ${time}`;

  const day = new Intl.DateTimeFormat(opts.locale === "zh" ? "zh-CN" : "en-NZ", {
    timeZone: NZ_TZ, weekday: "short", month: "short", day: "numeric",
  }).format(start);
  return `${day} ${time}`;
}

/**
 * Interpret a wall-clock time that a NZ source published without a timezone
 * ("2026-03-14 19:30:00") as an absolute instant.
 *
 * Getting this wrong is the classic aggregator bug: every event silently
 * shifts by 12–13 hours and half the feed lands on the wrong day.
 */
export function nzLocalToInstant(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(naiveUtc - nzOffsetMs(new Date(naiveUtc)));
  guess = new Date(naiveUtc - nzOffsetMs(guess));
  return guess;
}

/** Parse "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM:SS" as NZ wall-clock time. */
export function parseNzLocal(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(input.trim());
  if (m) {
    // A trailing Z or explicit offset means it is already absolute.
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(input.trim())) {
      const d = new Date(input);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return nzLocalToInstant(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, m[6] ? +m[6] : 0);
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (dateOnly) return nzLocalToInstant(+dateOnly[1]!, +dateOnly[2]!, +dateOnly[3]!);
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
