import { eventPageSchema, type ParsedEventQuery } from "@kiwi/core";
import { findEvents } from "@kiwi/db";

/** Server-side only: Netlify talks to Railway without exposing credentials. */
export function hasEventBackend() {
  return Boolean(process.env.API_BASE_URL || process.env.DATABASE_URL);
}

export async function loadEventPage(query: ParsedEventQuery) {
  if (!process.env.API_BASE_URL) return findEvents(query);
  const url = new URL("/api/events", process.env.API_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Event backend returned ${response.status}`);
  return eventPageSchema.parse(await response.json());
}
