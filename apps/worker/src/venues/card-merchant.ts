import { createHash } from "node:crypto";
import { load } from "cheerio";
import robotsParser from "robots-parser";
import { nzLocalToInstant, type NormalizedListing } from "@kiwi/core";
import type { VenueSource } from "./catalog";
import type { VenueReport } from "./crawl";

const USER_AGENT = "KiwiTodayBot/0.1";
const STORE_URL = "https://cardmerchant.co.nz/";
const API_URL = "https://portal.binderpos.com/api/events/forStore";

interface BinderEvent extends Record<string, unknown> {
    id: number | string;
    title: string;
    date: string;
    time: string;
}

function calendarDate(date: Date, offset: number): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const utc = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset));
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function parseResponse(value: unknown): BinderEvent[] {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!Array.isArray(parsed)) throw new Error("BinderPOS returned an unexpected response shape");
    return parsed.filter((row): row is BinderEvent => Boolean(row) && typeof row === "object");
}

async function checkRobots(origin: string, path: string, fetcher: typeof fetch): Promise<void> {
    const robotsUrl = new URL("/robots.txt", origin).href;
    const response = await fetcher(robotsUrl, { redirect: "manual", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok && response.status !== 404) throw new Error(`robots.txt HTTP ${response.status} for ${origin}`);
    const body = response.status === 404 ? "" : await response.text();
    const policy = robotsParser(robotsUrl, body);
    if (policy.isAllowed(new URL(path, origin).href, USER_AGENT) === false) throw new Error(`disallowed by robots.txt: ${origin}${path}`);
}

function cleanDescription(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const $ = load(value);
    $("p, li, div, br").append(" ");
    const text = $.root().text().replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 600) : null;
}

export async function crawlCardMerchant(source: VenueSource, options: {
    now: Date; days: number; fetcher?: typeof fetch;
}): Promise<VenueReport> {
    const fetcher = options.fetcher ?? fetch;
    const checkedAt = options.now.toISOString();
    const report: VenueReport = {
        venue: source, checkedAt, days: options.days, coverage: "partial", truncated: false,
        events: [], pages: [], dateOnlyAnnouncements: [],
    };
    const recordFailure = (error: unknown): VenueReport => {
        report.pages.push({
            url: STORE_URL, checkedAt, contentHash: "", text: "", status: "failed",
            error: error instanceof Error ? error.message : String(error),
        });
        return report;
    };

    try {
        const startDate = calendarDate(options.now, 0);
        const endDate = calendarDate(options.now, options.days);
        const endpoint = new URL(API_URL);
        endpoint.searchParams.set("startDate", startDate);
        endpoint.searchParams.set("endDate", endDate);

        await checkRobots(new URL(STORE_URL).origin, "/", fetcher);
        await checkRobots(endpoint.origin, endpoint.pathname, fetcher);
        const response = await fetcher(endpoint, {
            redirect: "manual",
            headers: {
                "user-agent": USER_AGENT,
                "content-type": "application/json",
                origin: new URL(STORE_URL).origin,
                referer: STORE_URL,
            },
            signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`BinderPOS HTTP ${response.status}`);
        const body = await response.text();
        if (body.length > 2_000_000) throw new Error("BinderPOS response exceeds 2 MB limit");
        const rows = parseResponse(JSON.parse(body));
        const from = nzLocalToInstant(...startDate.split("-").map(Number) as [number, number, number]);
        const until = nzLocalToInstant(...endDate.split("-").map(Number) as [number, number, number]);
        const events = new Map<string, NormalizedListing>();

        for (const row of rows) {
            if (row.disabled === true || row.isDisabled === true || row.deleting === true || row.isDeleting === true) continue;
            if (typeof row.title !== "string" || typeof row.date !== "string" || typeof row.time !== "string") continue;
            const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(row.date);
            const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(row.time);
            if (!dateMatch || !timeMatch) continue;
            const startsAt = nzLocalToInstant(
                Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]),
                Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3] ?? 0),
            );
            if (startsAt < options.now || startsAt < from || startsAt >= until) continue;
            const title = row.title.trim();
            if (!title) continue;
            const externalId = `${row.id ?? title}:${dateMatch[0]}`;
            const ticketPrice = Number(row.ticketPrice);
            const priceStatus = Number.isFinite(ticketPrice) && ticketPrice > 0 ? "unconfirmed" : null;
            const summary = cleanDescription(row.description);
            const image = [row.featureImage, row.banner, row.ticketImage].find((candidate) => typeof candidate === "string" && /^https:\/\//.test(candidate));
            const listing: NormalizedListing = {
                sourceSlug: source.slug, externalId, url: STORE_URL, title, summary,
                startsAt, endsAt: null, isFree: false, priceFrom: null,
                venueName: typeof row.buildingName === "string" && row.buildingName.trim() ? row.buildingName.trim() : source.name,
                address: [row.streetAddress, row.city, row.zipCode].filter((part) => typeof part === "string" && part.trim()).join(", ") || null,
                point: null, citySlug: source.city,
                categoryHint: typeof row.game === "string" && row.game.trim() ? row.game : title,
                coverImageUrl: typeof image === "string" ? image : null,
                popularity: 0,
                raw: { data: row, priceStatus },
            };
            events.set(externalId, listing);
        }

        report.events = [...events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        const evidence = JSON.stringify(rows.map(({ id, title, date, time }) => ({ id, title, date, time })));
        report.pages.push({
            url: endpoint.href, checkedAt, contentHash: createHash("sha256").update(evidence).digest("hex"),
            text: evidence.slice(0, 30_000), status: "structured",
        });
        return report;
    } catch (error) {
        return recordFailure(error);
    }
}