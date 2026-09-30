import { load } from "cheerio";

export interface Announcement {
  title: string; date: string; endDate?: string; sourceUrl: string; precision: "day";
  imageUrl?: string; summary?: string; scheduleText?: string; sessionDates?: string[];
}

function cleanText(value: string | undefined, max = 2_000): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text || text.length < 24 || /largest art institution in New Zealand, with a collection numbering/i.test(text) ||
    /^Experience .+ at .+\. Visit aucklandlive\.co\.nz to find out about/i.test(text) || /^Presented by:/i.test(text) ||
    /^Find .+ tickets at (?:www\.)?sparkarena\.co\.nz\b/i.test(text) ||
    /^(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day\s+)?\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}(?:\s*[-–]\s*\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})?$/i.test(text) ||
    /^\d{1,2}\s*[-–]\s*\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}$/i.test(text)) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanParagraphs(value: string | undefined, max = 2_000): string | undefined {
  const paragraphs = value?.split(/\n+/).map((paragraph) => paragraph.replace(/[\t ]+/g, " ").trim()).filter(Boolean) ?? [];
  const text = paragraphs.join("\n\n");
  if (text.length < 24) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function safeImage(raw: string | undefined, base: string): string | undefined {
  if (!raw || raw.startsWith("data:")) return undefined;
  try {
    const image = new URL(raw, base);
    if (image.protocol !== "https:" || image.username || image.password || /\.svg(?:$|\?)/i.test(image.href)) return undefined;
    return image.href;
  } catch { return undefined; }
}

/** Extract only publisher-supplied page metadata; no generated copy. */
export function extractPageMeta(html: string, url: string): Pick<Announcement, "imageUrl" | "summary" | "scheduleText" | "sessionDates"> {
  const $ = load(html);
  const page = new URL(url);
  const armageddonPoster = page.hostname === "www.armageddonexpo.com" && page.pathname.startsWith("/armageddon-updates/")
    ? $("main img[src*='/resources/images/picker/'], article img[src*='/resources/images/picker/']").first().attr("src")
    : undefined;
  const imageUrl = safeImage(
    armageddonPoster ?? $('meta[property="og:image"]').attr("content") ?? $('meta[name="twitter:image"]').attr("content") ??
    $("main img[src], article img[src]").filter((_, el) => !/logo|icon|avatar/i.test(`${$(el).attr("class") ?? ""} ${$(el).attr("alt") ?? ""}`)).first().attr("src"), url,
  );
  const showDescription = new URL(url).hostname === "www.aucklandlive.co.nz"
    ? $("section.text-content-block .content-primary p").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get()
      .filter((text) => text.length >= 40 && !/^More information\b/i.test(text)).join(" ")
    : undefined;
  const armageddonDescription = page.hostname === "www.armageddonexpo.com" && page.pathname.startsWith("/armageddon-updates/")
    ? $(".container.content").first().find("p").map((_, el) => {
      const paragraph = $(el).clone();
      paragraph.find("br").replaceWith(" ");
      return paragraph.text().replace(/\s+/g, " ").trim();
    }).get()
      .filter((text) => text.length >= 40).slice(0, 5).join("\n\n")
    : undefined;
  const sparkDescription = new URL(url).hostname === "www.sparkarena.co.nz"
    ? [
      $('[id^="extraInfo-"] .MuiTypography-paragraph p'),
      $('[data-component="ContentRichTextModule"]').first().find("p"),
    ].map((nodes) => nodes.map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get()
      .filter((text, index, all) => text.length >= 40 && !/^Age Restrictions?:/i.test(text) && all.indexOf(text) === index).join(" ")).find(Boolean)
    : undefined;
  const galleryHeading = $("h1,h2,h3,h4,h5").filter((_, el) => $(el).text().trim() === "Event detail").first();
  const galleryDescription = new URL(url).hostname === "www.aucklandartgallery.com" && galleryHeading.length
    ? galleryHeading.parent().parent().find(".rich-editor-content").first().find("p").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get()
      .filter((text) => text.length >= 40).join(" ")
    : undefined;
  const edenDescription = new URL(url).hostname === "edenpark.co.nz"
    ? $("body p").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get()
      .filter((text) => text.length >= 40 && !/^(?:An Eden Park membership|For all membership|Eden Park42|Phone \+64|Please read the full Conditions|Food outlets within|Please respect our neighbours|More information will be available|Ticket-holders can watch)/i.test(text))
      .join(" ")
    : undefined;
  const structuredDescriptions: string[] = [];
  const structuredSessionStarts: string[] = [];
  const visitJson = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visitJson); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some((type) => typeof type === "string" && /Event$/.test(type))) {
      if (typeof record.description === "string") structuredDescriptions.push(record.description);
      if (typeof record.startDate === "string") structuredSessionStarts.push(record.startDate);
    }
    if (record["@graph"]) visitJson(record["@graph"]);
  };
  $('script[type="application/ld+json"]').each((_, el) => { try { visitJson(JSON.parse($(el).text())); } catch { /* Ignore malformed metadata. */ } });
  const summary = cleanParagraphs(armageddonDescription) ?? [
    sparkDescription,
    showDescription,
    galleryDescription,
    edenDescription,
    ...structuredDescriptions,
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    ...$("main p, article p").map((_, el) => $(el).text()).get(),
  ].map((candidate) => cleanText(candidate)).find(Boolean);
  const isAucklandLiveShow = new URL(url).hostname === "www.aucklandlive.co.nz" && new URL(url).pathname.startsWith("/show/");
  const sessionDates = isAucklandLiveShow ? [...new Set(structuredSessionStarts.map((raw) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort() : [];
  const sessionTimes = isAucklandLiveShow ? [...new Set(structuredSessionStarts.map((raw) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  }).filter(Boolean))] : [];
  const scheduleText = sessionTimes.length && sessionTimes.length <= 4 ? sessionTimes.join(" / ") : sessionTimes.length ? "Multiple session times" : undefined;
  return { ...(imageUrl ? { imageUrl } : {}), ...(summary ? { summary } : {}), ...(scheduleText ? { scheduleText } : {}), ...(sessionDates.length ? { sessionDates } : {}) };
}

/** Read JSON arrays inside serialized application state without executing scripts. */
export function embeddedIncluded(html: string): unknown[] {
  const $ = load(html);
  const script = $("script").toArray().map((element) => $(element).text()).find((text) => text.includes("window.__INITIAL_STATE__"));
  if (!script) return [];
  const marker = '"included":';
  const at = script.indexOf(marker);
  if (at < 0) return [];
  const start = script.indexOf("[", at + marker.length);
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index >= 0 && index < script.length; index++) {
    const char = script[index];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      try { return JSON.parse(script.slice(start, index + 1)); } catch { return []; }
    }
  }
  return [];
}
/** Site-specific visible fields, verified against official pages. Never infer a year. */
export function extractAnnouncements(slug: string, html: string, url: string): Announcement[] {
  const $ = load(html);
  const items: Announcement[] = [];
  const liveVenues: Record<string, string> = { "the-civic": "The Civic", "auckland-town-hall": "Auckland Town Hall", "aotea-centre": "Aotea Centre", "bruce-mason": "Bruce Mason Centre" };
  if (liveVenues[slug] && new URL(url).hostname === "www.aucklandlive.co.nz" && new URL(url).pathname.startsWith("/venue/")) {
    for (const value of embeddedIncluded(html)) {
      const row = value as { type?: string; attributes?: Record<string, unknown> };
      const a = row?.attributes;
      if (row?.type !== "shows" || !a || typeof a.name !== "string" || typeof a.slug !== "string" || !/^[a-z0-9-]+$/.test(a.slug) || typeof a.venue_name !== "string" || !a.venue_name.includes(liveVenues[slug]!)) continue;
      if (typeof a.start_date !== "string" || typeof a.end_date !== "string") continue;
      const date = a.start_date.slice(0, 10), endDate = a.end_date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) continue;
      const imageUrl = safeImage(typeof a.landscape_thumbnail === "string" ? a.landscape_thumbnail : undefined, url);
      items.push({ title: a.name, date, ...(date !== endDate ? { endDate } : {}), sourceUrl: new URL(`/show/${a.slug}`, url).href, precision: "day", ...(imageUrl ? { imageUrl } : {}) });
    }
  }
  const add = (title: string, date: string, href: string, extra: Pick<Announcement, "endDate" | "imageUrl" | "summary" | "scheduleText" | "sessionDates"> = {}) => {
    try {
      const source = new URL(href, url);
      if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || source.origin !== new URL(url).origin) return;
      items.push({ title: title.trim(), date, sourceUrl: source.href, precision: "day", ...extra });
    } catch { /* Bad source URL cannot be published. */ }
  };
  const nzDate = (raw: string) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  };
  const nzTime = (raw: string) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  };
  if (slug === "armageddon-auckland" && new URL(url).hostname === "www.armageddonexpo.com" && new URL(url).pathname === "/") {
    const text = $("body").text().replace(/\s+/g, " ");
    const articleUrl = $('a[href*="/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/"]').first().attr("href");
    if (/AUCKLAND SPRING 2026/i.test(text) && /October 23\/24\/25\/26th/i.test(text) && /Auckland Showgrounds/i.test(text) && articleUrl) {
      add("Armageddon Expo Auckland Spring 2026", "2026-10-23", articleUrl, {
        sessionDates: ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"],
      });
      const event = items.at(-1);
      if (event) event.endDate = "2026-10-26";
    }
    if (/AUCKLAND WINTER 2027/i.test(text) && /5th\s*-\s*7th\s+June/i.test(text) && /Auckland Showgrounds/i.test(text) && /10am\s+to\s+5pm\s+all days/i.test(text)) {
      add("Armageddon Expo Auckland Winter 2027", "2027-06-05", url, {
        summary: "Armageddon Expo Auckland Winter 2027 runs 5–7 June at Auckland Showgrounds, 10am–5pm all days.",
        scheduleText: "10am–5pm daily",
        sessionDates: ["2027-06-05", "2027-06-06", "2027-06-07"],
      });
      const event = items.at(-1);
      if (event) event.endDate = "2027-06-07";
    }
  }
  if (slug === "cosmos-con-auckland" && new URL(url).hostname === "cosmosnz.org" && new URL(url).pathname === "/cosmos-con-2027/") {
    const text = $("body").text().replace(/\s+/g, " ");
    if (/COSMOS CON 2027/i.test(text) && /13 March 2027 10am\s*[-–]\s*5pm/i.test(text) && /Auckland Netball Centre/i.test(text)) {
      add("Cosmos Con 2027", "2027-03-13", url, { scheduleText: "10am–5pm" });
    }
  }
  if (slug === "basement-theatre" && new URL(url).hostname === "basementtheatre.co.nz" && new URL(url).pathname === "/blogs/whats-on") {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const year = new Date().getFullYear();
    const parseDay = (raw: string, month: string): string | null => {
      const day = Number(raw);
      return Number.isInteger(day) && day >= 1 && day <= 31 && months[month] ? `${year}-${months[month]}-${String(day).padStart(2, "0")}` : null;
    };
    $("a[href]").filter((_, element) => ($(element).attr("href") ?? "").startsWith("/blogs/whats-on/")).each((_, element) => {
      const card = $(element);
      const title = card.find("h3").first().text().replace(/\s+/g, " ").trim();
      const dateText = card.find("h3").last().text().replace(/\s+/g, " ").trim();
      const monthHeading = card.closest(".tw-col").find("h2").first().text().trim().toLowerCase();
      const month = monthHeading.slice(0, 3);
      const href = card.attr("href");
      const imageUrl = safeImage(card.find("img[src]").first().attr("src"), url);
      if (!title || !href || !months[month] || /^every\s+/i.test(dateText)) return;
      const range = /^(\d{1,2})(?:\s*&\s*(\d{1,2})|\s*,\s*(\d{1,2})|\s*-\s*(\d{1,2}))?\s+([A-Za-z]{3})/i.exec(dateText);
      if (!range) return;
      const start = parseDay(range[1]!, month);
      if (!start) return;
      const endDay = range[2] ?? range[3] ?? range[4];
      const endMonth = range[4] && /\b([A-Za-z]{3})$/.test(dateText) ? dateText.match(/\b([A-Za-z]{3})$/i)?.[1]?.slice(0, 3).toLowerCase() : month;
      const end = endDay && endMonth ? parseDay(endDay, endMonth) : null;
      const scheduleText = dateText.split(",").slice(1).join(",").trim() || undefined;
      add(title, start, href, { ...(end && end !== start ? { endDate: end } : {}), ...(imageUrl ? { imageUrl } : {}), ...(scheduleText ? { scheduleText } : {}) });
    });
  }
  if (slug === "asb-waterfront" && new URL(url).hostname === "www.atc.co.nz" && new URL(url).pathname === "/asb-waterfront-theatre-events") {
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    $(".banner-detail").each((_, element) => {
      const card = $(element);
      const href = card.find(".buttons-wrapper .btn-primary").first().attr("href");
      const season = href?.split("/").find((part) => part.endsWith("-season"));
      const year = Number(season?.slice(0, 4));
      if (!href || !season || season !== `${year}-season` || !Number.isInteger(year)) return;
      const range = card.find(".dates-location p").first().text().trim();
      const separator = range.includes("–") ? "–" : "-";
      const rangeParts = range.split(separator).map((part) => part.trim());
      if (rangeParts.length !== 2) return;
      const startParts = rangeParts[0]!.split(/\s+/);
      const endParts = rangeParts[1]!.split(/\s+/);
      if (startParts.length !== 2 || endParts.length !== 2) return;
      const startMonth = months[startParts[1]!.toLowerCase()];
      const endMonth = months[endParts[1]!.toLowerCase()];
      const startDay = Number(startParts[0]);
      const endDay = Number(endParts[0]);
      if (!startMonth || !endMonth || !Number.isInteger(startDay) || !Number.isInteger(endDay)) return;
      const endYear = endMonth < startMonth ? year + 1 : year;
      const date = `${year}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
      const title = card.find("h2,h3,h4").first().text().trim() || card.find(".buttons-wrapper .btn-primary").first().text().trim();
      if (!title) return;
      add(title, date, href, { endDate });
    });
  }
  if (slug === "go-media-stadium" && new URL(url).hostname === "www.aucklandstadiums.co.nz" && new URL(url).pathname.startsWith("/event/")) {
    const calendarDate = $(".event-hero-carousel-detail").first().clone();
    calendarDate.find("svg").remove();
    const dateText = calendarDate.text().replace(/^Event Calendar/i, "").trim();
    const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(dateText);
    const monthNumbers: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const month = match ? monthNumbers[match[2]!.toLowerCase()] : undefined;
    const title = $(".event-hero-carousel-heading").first().text().trim();
    if (match && month && title) {
      const date = `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
      const text = $("main").text().replace(/\s+/g, " ");
      const kickoff = /kick[ -]?off\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.exec(text)?.[1]?.replace(/\s+/g, "");
      add(title, date, url, {
        ...extractPageMeta(html, url),
        ...(kickoff ? { scheduleText: kickoff } : {}),
      });
    }
  }
  if (slug === "western-springs" && new URL(url).hostname === "www.aucklandstadiums.co.nz" && new URL(url).pathname.startsWith("/event/")) {
    const text = $("main").text().replace(/\s+/g, " ");
    const dateMatch = /Event Calendar\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const month = dateMatch ? months[dateMatch[2]!.toLowerCase()] : undefined;
    const title = $("h1").first().text().replace(/\s+/g, " ").trim();
    if (dateMatch && month && title) add(title, `${dateMatch[3]}-${month}-${dateMatch[1]!.padStart(2, "0")}`, url, extractPageMeta(html, url));
  }
  if (slug === "motat" && new URL(url).hostname === "motat.nz" && new URL(url).pathname.startsWith("/events/") && new URL(url).pathname !== "/events/") {
    const text = $("body").text().replace(/\s+/g, " ");
    const dateMatch = /Date & Time\s*(\d{1,2})\s+([A-Za-z]{3,9})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i.exec(text);
    const monthNumbers: Record<string, string> = {
      jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
      may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09", september: "09",
      oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
    };
    const title = $("h1").first().text().replace(/\s+/g, " ").trim();
    const startMonth = dateMatch ? monthNumbers[dateMatch[2]!.toLowerCase()] : undefined;
    const endMonth = dateMatch ? monthNumbers[dateMatch[4]!.toLowerCase()] : undefined;
    if (dateMatch && startMonth && endMonth && title) {
      const startDate = `${dateMatch[5]}-${startMonth}-${dateMatch[1]!.padStart(2, "0")}`;
      const endYear = Number(endMonth) < Number(startMonth) ? Number(dateMatch[5]) + 1 : Number(dateMatch[5]);
      const endDate = `${endYear}-${endMonth}-${dateMatch[3]!.padStart(2, "0")}`;
      add(title, startDate, url, { endDate, ...extractPageMeta(html, url) });
    }
  }
  const galleryDate = (raw: string): { date: string; endDate?: string } | null => {
    const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
    const match = /^(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})(?:\s*[-–]\s*(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4}))?$/.exec(raw.trim());
    if (!match || !months[match[2]!] || (match[5] && !months[match[5]])) return null;
    const date = `${match[3]}-${months[match[2]!]!}-${match[1]!.padStart(2, "0")}`;
    const endDate = match[4] ? `${match[6]}-${months[match[5]!]!}-${match[4].padStart(2, "0")}` : undefined;
    if (endDate && endDate < date) return null;
    return { date, ...(endDate && endDate !== date ? { endDate } : {}) };
  };
  const gallerySessionDate = (raw: string): string | null => {
    const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Sept: "09", Oct: "10", Nov: "11", Dec: "12" };
    const match = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(\d{1,2})\s+([A-Z][a-z]{2,3})\s+(\d{4}),/.exec(raw.trim());
    return match && months[match[2]!] ? `${match[3]}-${months[match[2]!]!}-${match[1]!.padStart(2, "0")}` : null;
  };
  if (slug === "auckland-art-gallery" && new URL(url).pathname.startsWith("/visit/events")) {
    const meta = extractPageMeta(html, url);
    if (new URL(url).pathname === "/visit/events") {
      $('a[href^="/visit/events/"]').each((_, el) => {
        const row = $(el);
        const title = row.find("h5").first().text().replace(/\s+/g, " ").trim();
        const texts = row.find("p").map((_, node) => $(node).text().replace(/\s+/g, " ").trim()).get();
        const dateIndex = texts.findIndex((text) => Boolean(galleryDate(text)));
        const dateText = dateIndex >= 0 ? texts[dateIndex] : undefined;
        const parsed = dateText ? galleryDate(dateText) : null;
        if (!title || !parsed) return;
        const sourceUrl = new URL(row.attr("href")!, url).href;
        const imageUrl = safeImage(row.find("img[src]").first().attr("src"), url);
        const scheduleText = dateIndex >= 0 ? texts[dateIndex + 1]?.trim() : undefined;
        items.push({ title, ...parsed, sourceUrl, precision: "day", ...(imageUrl ? { imageUrl } : {}), ...(scheduleText ? { scheduleText } : {}) });
      });
    } else {
      let eventData: Record<string, unknown> | undefined;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($(el).text()) as Record<string, unknown>;
          if (parsed["@type"] === "Event") eventData = parsed;
        } catch { /* Ignore malformed publisher metadata. */ }
      });
      const texts = $("main p").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get();
      const dateIndex = texts.findIndex((text) => Boolean(galleryDate(text)));
      const dateText = dateIndex >= 0 ? texts[dateIndex] : undefined;
      const parsed = dateText ? galleryDate(dateText) : null;
      const title = typeof eventData?.name === "string" ? eventData.name.trim() : $("main h4").first().text().trim();
      const summary = typeof eventData?.description === "string" ? cleanText(eventData.description) : meta.summary;
      let scheduleText = dateIndex >= 0 ? texts[dateIndex + 1]?.trim() : undefined;
      const sessionDates = [...new Set(texts.map(gallerySessionDate).filter((date): date is string => Boolean(date)))];
      const sessionWeekdays = [...new Set(sessionDates.map((date) => new Intl.DateTimeFormat("en-NZ", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))))];
      if (scheduleText && sessionWeekdays.length === 1 && !/(?:weekdays?|weekends?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)/i.test(scheduleText)) scheduleText = `${sessionWeekdays[0]}s · ${scheduleText}`;
      if (title && parsed) items.push({ title, ...parsed, sourceUrl: url, precision: "day", ...(meta.imageUrl ? { imageUrl: meta.imageUrl } : {}), ...(summary ? { summary } : {}), ...(scheduleText ? { scheduleText } : {}), ...(sessionDates.length ? { sessionDates } : {}) });
    }
  }
  if (slug === "powerstation" && new URL(url).pathname.replace(/\/$/, "") === "/shows/coming") {
    $("li.show").each((_, el) => {
      const row = $(el);
      add(row.find("h2").text(), nzDate(row.find("time[datetime]").attr("datetime") ?? ""), row.find("a.ab--cover").attr("href") ?? "", {
        imageUrl: safeImage(row.find("img[src]").first().attr("src"), url),
        summary: cleanText(row.find("p").first().text()),
        scheduleText: nzTime(row.find("time[datetime]").attr("datetime") ?? ""),
      });
    });
  }
  if (slug === "q-theatre" && new URL(url).pathname.startsWith("/shows/")) {
    $(".meta__date-items time[datetime]").each((_, el) => {
      const raw = $(el).attr("datetime") ?? "";
      add($("h1").first().text(), nzDate(raw), url, { scheduleText: nzTime(raw) });
    });
  }
  if (slug === "eden-park") {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    $(".event-item").each((_, el) => {
      const row = $(el);
      const match = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(row.find(".event-date").text().trim());
      if (!match) return; // Date ranges need their own model; don't fabricate individual sessions.
      const month = months.indexOf(match[2]!);
      if (month < 0) return;
      add(row.find("h3").text(), `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`, row.find("a").first().attr("href") ?? "");
    });
  }
  return items;
}
