/**
 * Deduplication.
 *
 * The same concert shows up on Eventfinda, on Ticketmaster, and on the venue's
 * own site, with three different titles and three different start times that
 * disagree by an hour (doors vs. on stage). Nothing here is exact-match; every
 * signal is scored and combined.
 *
 * Kept dependency-free and pure so it can be unit-tested without a database and
 * reused verbatim in a "merge these two?" review UI.
 */

/** Words that carry no identity — they differ between listings of one event. */
const NOISE = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on", "for", "with", "to", "by",
  "presents", "present", "presented", "featuring", "feat", "ft", "live", "tour",
  "show", "shows", "event", "tickets", "ticket", "official", "nz", "new", "zealand",
  "aotearoa", "concert", "session", "sessions", "night", "day", "series",
]);

/** Strip macrons and accents so "Taupō" and "Taupo" agree. */
export function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Identity-bearing tokens of a title. CJK is split per character (no word
 * boundaries), Latin on non-alphanumerics.
 */
export function titleTokens(title: string): string[] {
  const cleaned = deaccent(title.toLowerCase())
    .replace(/\([^)]*\)/g, " ")          // "(SOLD OUT)", "(18+)"
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!cleaned) return [];

  const out: string[] = [];
  for (const chunk of cleaned.split(/\s+/)) {
    if (/[㐀-鿿぀-ヿ]/.test(chunk)) {
      // CJK run: bigrams carry more signal than single characters.
      const chars = [...chunk];
      if (chars.length === 1) out.push(chars[0]!);
      for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i]! + chars[i + 1]!);
    } else if (!NOISE.has(chunk)) {
      out.push(chunk);
    }
  }
  return out;
}

/**
 * Order-insensitive canonical form. Two listings that differ only in word order
 * or noise words collapse to the same fingerprint, which makes this usable as a
 * cheap SQL index to shortlist candidates before scoring.
 */
export function titleFingerprint(title: string): string {
  return [...new Set(titleTokens(title))].sort().join(" ");
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Dice coefficient over character trigrams — catches typos and truncation. */
export function trigramDice(a: string, b: string): number {
  const grams = (s: string) => {
    const p = `  ${deaccent(s.toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    const set = new Set<string>();
    for (let i = 0; i + 3 <= p.length; i++) set.add(p.slice(i, i + 3));
    return set;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

export function titleSimilarity(a: string, b: string): number {
  return Math.max(jaccard(titleTokens(a), titleTokens(b)), trigramDice(a, b));
}

const EARTH_R_M = 6_371_000;
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Linear decay: 1 at or below `full`, 0 at or above `zero`. */
function decay(value: number, full: number, zero: number): number {
  if (value <= full) return 1;
  if (value >= zero) return 0;
  return 1 - (value - full) / (zero - full);
}

export interface MatchCandidate {
  title: string;
  startsAt: Date;
  /** Omit when the source gave no coordinates; geo then abstains rather than vetoes. */
  point?: { lat: number; lng: number } | null;
  /** Canonical venue id, when both sides resolved to the same venue row. */
  venueId?: string | null;
  /** The source's own permalink. An exact match is decisive on its own. */
  url?: string | null;
}

export type MatchVerdict = "same" | "review" | "different";

export interface MatchResult {
  verdict: MatchVerdict;
  confidence: number;
  signals: { title: number; time: number; geo: number | null; urlExact: boolean };
}

export const MATCH_THRESHOLDS = {
  /** Below this title similarity nothing else can rescue the pair. */
  minTitle: 0.55,
  /** Start times further apart than this are treated as separate sessions. */
  maxTimeSkewMs: 2 * 60 * 60 * 1000,
  /** Venues further apart than this are treated as different places. */
  maxDistanceM: 500,
  autoMerge: 0.8,
  review: 0.62,
} as const;

/**
 * Decide whether two listings describe the same event.
 *
 * Time and distance act as vetoes: a similar title at a different venue, or the
 * same show on a different night, is a *different* event — that is the whole
 * point of a multi-night tour.
 */
export function matchEvents(a: MatchCandidate, b: MatchCandidate): MatchResult {
  const urlExact = Boolean(a.url && b.url && a.url === b.url);
  if (urlExact) {
    return { verdict: "same", confidence: 1, signals: { title: 1, time: 1, geo: 1, urlExact: true } };
  }

  const title = titleSimilarity(a.title, b.title);
  const skew = Math.abs(a.startsAt.getTime() - b.startsAt.getTime());
  const time = decay(skew, 30 * 60 * 1000, MATCH_THRESHOLDS.maxTimeSkewMs);

  let geo: number | null;
  if (a.venueId && b.venueId) {
    geo = a.venueId === b.venueId ? 1 : 0;
  } else if (a.point && b.point) {
    geo = decay(haversineMeters(a.point, b.point), 150, MATCH_THRESHOLDS.maxDistanceM);
  } else {
    geo = null; // no location on at least one side — abstain
  }

  const signals = { title, time, geo, urlExact: false };
  if (title < MATCH_THRESHOLDS.minTitle || time === 0 || geo === 0) {
    return { verdict: "different", confidence: 0, signals };
  }

  // Geo abstention costs confidence rather than being scored as agreement.
  const confidence =
    geo === null
      ? 0.6 * title + 0.25 * time
      : 0.5 * title + 0.2 * time + 0.3 * geo;

  const verdict: MatchVerdict =
    confidence >= MATCH_THRESHOLDS.autoMerge ? "same"
    : confidence >= MATCH_THRESHOLDS.review ? "review"
    : "different";

  return { verdict, confidence, signals };
}
