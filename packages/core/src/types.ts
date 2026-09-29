import { z } from "zod";
import { CATEGORY_SLUGS } from "./categories";
import { CITY_SLUGS } from "./cities";
import { DATE_BUCKET_SLUGS } from "./dates";

export const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type Point = z.infer<typeof pointSchema>;

/** A venue as we store it once, canonically, across every source. */
export const venueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  citySlug: z.enum(CITY_SLUGS as [string, ...string[]]).nullable(),
  point: pointSchema.nullable(),
});
export type Venue = z.infer<typeof venueSchema>;

/**
 * What the API hands the web and app clients. Deliberately flat — this is a
 * view model, not the storage model.
 */
export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleZh: z.string().nullable(),
  summary: z.string().nullable(),
  summaryZh: z.string().nullable(),
  category: z.enum(CATEGORY_SLUGS as [string, ...string[]]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable(),
  isFree: z.boolean(),
  priceFrom: z.number().nullable(),
  currency: z.string().default("NZD"),
  venue: venueSchema.nullable(),
  point: pointSchema.nullable(),
  citySlug: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  /** Where a click-through goes. Always the original listing — we link out. */
  sourceUrl: z.string(),
  sourceName: z.string(),
  /** How many sources carry this event; a proxy for "how big a deal is it". */
  sourceCount: z.number().int().min(1).default(1),
  popularity: z.number().int().min(0).default(0),
  priceStatus: z.enum(["unconfirmed"]).optional(),
  /** Internal detail route when the app has a richer first-party page. */
  detailUrl: z.string().optional(),
  /** Publisher supplied a calendar day but no verified start time. */
  dateOnly: z.boolean().optional(),
  /** Publisher supplied recurrence or session-time text. */
  scheduleText: z.string().optional(),
});
export type KiwiEvent = z.infer<typeof eventSchema>;

/** Query accepted by GET /api/events. Shared by web, app and tests. */
export const eventQuerySchema = z.object({
  city: z.enum(CITY_SLUGS as [string, ...string[]]).optional(),
  /** Canonical venue slug selected from the venue directory. */
  venue: z.string().trim().regex(/^[a-z0-9-]+$/).max(80).optional(),
  date: z.union([
    z.enum(DATE_BUCKET_SLUGS as [string, ...string[]]),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const [year, month, day] = value.split("-").map(Number);
      const parsed = new Date(Date.UTC(year!, month! - 1, day!));
      return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
    }, "Invalid calendar date"),
  ]).default("week"),
  category: z.enum(CATEGORY_SLUGS as [string, ...string[]]).optional(),
  /** Map viewport: minLng,minLat,maxLng,maxLat */
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/)
    .optional()
    .transform((v) => (v ? (v.split(",").map(Number) as [number, number, number, number]) : undefined)),
  q: z.string().trim().min(1).max(120).optional(),
  free: z.union([z.boolean(), z.enum(["true", "false"])]).optional()
    .transform((v) => v === undefined ? undefined : v === true || v === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  cursor: z.string().optional(),
});
export type EventQuery = z.input<typeof eventQuerySchema>;
export type ParsedEventQuery = z.output<typeof eventQuerySchema>;

export const eventPageSchema = z.object({
  events: z.array(eventSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nullable(),
});
export type EventPage = z.infer<typeof eventPageSchema>;

/**
 * A single listing as scraped, before it is merged into a canonical event.
 * `raw` is kept verbatim so normalisation can be re-run without re-fetching —
 * the field mapping for a new source is never right the first time.
 */
export interface NormalizedListing {
  sourceSlug: string;
  externalId: string;
  url: string;
  title: string;
  summary: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isFree: boolean;
  priceFrom: number | null;
  venueName: string | null;
  address: string | null;
  point: Point | null;
  citySlug: string | null;
  categoryHint: string | null;
  coverImageUrl: string | null;
  popularity: number;
  raw: unknown;
}
