/** Cities we aggregate for. `radiusKm` bounds "events in this city" queries. */
export const CITIES = [
  { slug: "auckland",     zh: "奥克兰",   en: "Auckland",     lat: -36.8509, lng: 174.7645, zoom: 11.5, radiusKm: 45 },
  { slug: "wellington",   zh: "惠灵顿",   en: "Wellington",   lat: -41.2866, lng: 174.7756, zoom: 12,   radiusKm: 30 },
  { slug: "christchurch", zh: "基督城",   en: "Christchurch", lat: -43.5309, lng: 172.6365, zoom: 12,   radiusKm: 35 },
  { slug: "queenstown",   zh: "皇后镇",   en: "Queenstown",   lat: -45.0312, lng: 168.6626, zoom: 11.5, radiusKm: 40 },
  { slug: "taupo",        zh: "陶波",     en: "Taupō",        lat: -38.6857, lng: 176.0702, zoom: 12,   radiusKm: 30 },
] as const;

export type CitySlug = (typeof CITIES)[number]["slug"];
export const CITY_SLUGS = CITIES.map((c) => c.slug) as readonly CitySlug[];

export function getCity(slug: string) {
  return CITIES.find((c) => c.slug === slug);
}

/**
 * Nearest city whose radius contains the point, else null.
 *
 * A null city is not a failure: plenty of real events are in Hokitika. They are
 * still stored and still show up in map/bbox queries — they just do not belong
 * to a city tab yet.
 */
export function resolveCity(point: { lat: number; lng: number } | null): CitySlug | null {
  if (!point) return null;
  let best: { slug: CitySlug; km: number } | null = null;
  for (const c of CITIES) {
    const km = approxKm(point, c);
    if (km <= c.radiusKm && (!best || km < best.km)) best = { slug: c.slug, km };
  }
  return best?.slug ?? null;
}

/** Equirectangular approximation — plenty accurate at city scale, and cheap. */
function approxKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}
