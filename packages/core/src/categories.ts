/**
 * Canonical categories. Deliberately small — a filter bar with 15 chips is a
 * filter bar nobody uses. Source taxonomies are mapped onto these.
 */
export const CATEGORIES = [
  { slug: "music", zh: "音乐", en: "Music" },
  { slug: "market", zh: "市集", en: "Markets" },
  { slug: "outdoor", zh: "户外", en: "Outdoors" },
  { slug: "sports", zh: "体育", en: "Sports" },
  { slug: "family", zh: "亲子", en: "Family" },
  { slug: "water", zh: "水上", en: "On the water" },
  { slug: "arts", zh: "艺文", en: "Arts" },
  { slug: "comedy", zh: "脱口秀", en: "Comedy" },
  { slug: "comics", zh: "动漫漫展", en: "Anime & comics" },
  { slug: "tabletop", zh: "卡牌桌游", en: "Card & tabletop games" },
  { slug: "food", zh: "美食", en: "Food & drink" },
  { slug: "other", zh: "其他", en: "Other" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as readonly CategorySlug[];

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

/**
 * Keyword → category. Applied to the source's own category label first, then to
 * the title as a fallback. Order matters: the first hit wins, so put the
 * narrow signals ("kayak") above the broad ones ("water"). Keywords are
 * matched as complete words or phrases so, for example, "sails into Auckland"
 * does not turn a concert into an on-the-water event.
 */
const RULES: ReadonlyArray<readonly [CategorySlug, readonly string[]]> = [
  ["comics", ["overload", "armageddon expo", "cosmos con", "anime", "manga", "cosplay", "comic con", "comic-con", "comics", "comic book", "graphic novel"]],
  ["tabletop", ["tcg", "trading card", "trading cards", "card game", "card games", "pokemon", "pokémon", "magic: the gathering", "mtg", "yu-gi-oh", "yugioh", "one piece card game", "one piece extra grand battle", "one piece hobby", "lorcana", "flesh and blood", "star wars unlimited", "grand archive", "riftbound", "dungeons & dragons", "dungeons and dragons", "d&d", "board game", "board games", "tabletop", "roleplaying game", "role-playing game"]],
  ["water", ["surf", "kayak", "paddle", "sail", "scuba", "snorkel", "snorkeling", "snorkelling", "swim", "boat", "yacht", "waka ama", "rowing", "on the water"]],
  ["sports", ["rugby", "cricket", "netball", "league", "football", "soccer", "basketball", "marathon", "triathlon", "race", "match", "tournament", "sport", "fitness", "cycling"]],
  ["market", ["market", "fair", "bazaar", "car boot", "flea", "artisan", "makers"]],
  ["food", ["food", "wine", "beer", "brew", "dining", "degustation", "tasting", "coffee", "restaurant", "feast"]],
  ["comedy", ["stand-up", "stand up", "comedian", "comedy"]],
  ["outdoor", ["hike", "walk", "tramp", "trail", "bush", "garden", "park run", "outdoor", "camping", "climb", "mountain bike"]],
  ["family", ["kids", "family", "children", "whānau", "whanau", "playground", "toddler", "school holiday"]],
  ["arts", ["theatre", "theater", "exhibition", "gallery", "museum", "art", "dance", "ballet", "opera", "film", "cinema", "literature", "poetry"]],
  ["music", ["music", "musician", "singer", "songwriter", "pop artist", "recording artist", "album", "gig", "concert", "band", "dj", "live", "festival", "orchestra", "symphony", "choir", "jazz", "hip hop", "electronic"]],
];

function containsKeyword(text: string, keyword: string): boolean {
  const pattern = keyword
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i").test(text);
}

/** Best-effort mapping. Never throws; falls back to "other". */
export function inferCategory(...signals: Array<string | null | undefined>): CategorySlug {
  const hay = signals.filter(Boolean).join(" ").toLowerCase().replace(/\badult swim(?=\s+(?:special|series|show)\b|\/)/g, "");
  if (!hay) return "other";
  for (const [slug, keywords] of RULES) {
    if (keywords.some((keyword) => containsKeyword(hay, keyword))) return slug;
  }
  return "other";
}
