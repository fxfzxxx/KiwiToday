import type { NormalizedListing } from "@kiwi/core";

export interface FetchContext {
  /** Per-source `config` jsonb from the sources table. */
  config: Record<string, unknown>;
  /** Stop paging once we are this far ahead; nobody browses 18 months out. */
  horizonDays: number;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface SourceAdapter {
  slug: string;
  /**
   * Yields listings one page at a time. Generators rather than arrays so a
   * source with 40k events does not have to fit in memory, and so a failure
   * halfway through still commits what it already produced.
   */
  fetchAll(ctx: FetchContext): AsyncGenerator<NormalizedListing[], void, unknown>;
}

/** Shared fetch with timeout + one retry; upstream sites flap constantly. */
export async function getJson(url: string, init: RequestInit = {}, attempt = 0): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { accept: "application/json", "user-agent": "KiwiTodayBot/0.1 (+https://kiwitoday.nz/bot)", ...init.headers },
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`upstream ${res.status}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await res.json();
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return getJson(url, init, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
