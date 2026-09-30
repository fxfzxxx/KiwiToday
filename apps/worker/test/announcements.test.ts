import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAnnouncements, extractPageMeta } from "../src/venues/announcements";
import { VENUE_SOURCES } from "../src/venues/catalog";

test("Auckland Live embedded shows preserve ranges and filter venue without executing JavaScript", () => {
  const show = (venue: string) => ({ type: "shows", attributes: { name: 'A show with [brackets] and "quotes"', slug: "test-show", venue_name: venue, start_date: "2026-09-20T00:00:00+12:00", end_date: "2026-10-10T23:59:00+13:00" } });
  const html = `<script>window.__INITIAL_STATE__ = {other:undefined,"included":${JSON.stringify([show("The Civic"), show("Auckland Town Hall")])}}; throw new Error("never execute");</script>`;
  const result = extractAnnouncements("the-civic", html, "https://www.aucklandlive.co.nz/venue/the-civic");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.date, "2026-09-20");
  assert.equal(result[0]?.endDate, "2026-10-10");
  assert.equal(result[0]?.sourceUrl, "https://www.aucklandlive.co.nz/show/test-show");
  assert.equal(extractAnnouncements("the-civic", html.replace(/\]\}/g, ""), "https://www.aucklandlive.co.nz/venue/the-civic").length, 0);
});

test("catalog contains twenty-four distinct HTTPS venue entries", () => {
  assert.equal(VENUE_SOURCES.length, 24);
  assert.equal(new Set(VENUE_SOURCES.map((venue) => venue.slug)).size, 24);
  assert.ok(VENUE_SOURCES.every((venue) => venue.seeds.every((url) => new URL(url).protocol === "https:")));
});
test("ASB Waterfront extracts date ranges only when the linked season states a year", () => {
  const html = '<div class="banner-detail"><h2>Cabaret</h2><p>The Musical at the Kit Kat Club</p><div class="dates-location"><p>22 Sep – 25 Oct</p><p>ASB Waterfront Theatre</p></div><div class="buttons-wrapper"><a class="btn-primary" href="/whats-on/2026-season/cabaret">Cabaret</a><a href="/whats-on/2026-season/cabaret#tickets">Book Now</a></div></div>';
  const result = extractAnnouncements("asb-waterfront", html, "https://www.atc.co.nz/asb-waterfront-theatre-events");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    title: "Cabaret",
    date: "2026-09-22",
    endDate: "2026-10-25",
    sourceUrl: "https://www.atc.co.nz/whats-on/2026-season/cabaret",
    precision: "day",
  });
  assert.equal(extractAnnouncements("asb-waterfront", html.replace("2026-season", "season"), "https://www.atc.co.nz/asb-waterfront-theatre-events").length, 0);
});
test("Cosmos Con extracts its official Auckland 2027 date, hours and source page", () => {
  const html = '<h1>COSMOS CON 2027</h1><main><p>13 March 2027 10am-5pm</p><p>Auckland Netball Centre</p></main>';
  const result = extractAnnouncements("cosmos-con-auckland", html, "https://cosmosnz.org/cosmos-con-2027/");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Cosmos Con 2027");
  assert.equal(result[0]?.date, "2027-03-13");
  assert.equal(result[0]?.scheduleText, "10am–5pm");
  assert.equal(result[0]?.sourceUrl, "https://cosmosnz.org/cosmos-con-2027/");
  assert.equal(extractAnnouncements("cosmos-con-auckland", html.replace("2027", ""), "https://cosmosnz.org/cosmos-con-2027/").length, 0);
});
test("Go Media event pages extract explicit match dates and kick-off times", () => {
  const html = '<main><h1 class="event-hero-carousel-heading">Auckland FC vs Melbourne City 2026/27 Season</h1><span class="event-hero-carousel-detail"><svg><title>Event Calendar</title></svg>17 October 2026</span><span class="event-hero-carousel-detail">Go Media Stadium</span><p>Kick off 5pm</p><p>Auckland FC take on Melbourne City in a confirmed A-League home fixture.</p></main>';
  const result = extractAnnouncements("go-media-stadium", html, "https://www.aucklandstadiums.co.nz/event/auckland-fc-vs-melbourne-city-202627-season");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Auckland FC vs Melbourne City 2026/27 Season");
  assert.equal(result[0]?.date, "2026-10-17");
  assert.equal(result[0]?.scheduleText, "5pm");
  assert.match(result[0]?.summary ?? "", /confirmed A-League home fixture/);
  assert.equal(result[0]?.sourceUrl, "https://www.aucklandstadiums.co.nz/event/auckland-fc-vs-melbourne-city-202627-season");
  const season = '<main><h1 class="event-hero-carousel-heading">Auckland FC 2026/2027 Home A-League Season</h1><span class="event-hero-carousel-detail"><svg><title>Event Calendar</title></svg>17 October 2026 - 08 May 2027</span></main>';
  assert.equal(extractAnnouncements("go-media-stadium", season, "https://www.aucklandstadiums.co.nz/event/auckland-fc-20262027-home-a-league-season").length, 0);
});
test("Western Springs event pages extract official single-event dates", () => {
  const html = '<main><h1>Foo Fighters - Take Cover Tour 2027</h1><div>Event Calendar22 January 2027</div><div>LocationWestern Springs Bowl</div><p>Foo Fighters return to Auckland in Jan 2027</p></main>';
  const result = extractAnnouncements("western-springs", html, "https://www.aucklandstadiums.co.nz/event/foo-fighters-take-cover-tour-2027");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Foo Fighters - Take Cover Tour 2027");
  assert.equal(result[0]?.date, "2027-01-22");
  assert.match(result[0]?.summary ?? "", /Foo Fighters return/);
});
test("MOTAT event pages extract published date ranges and official detail metadata", () => {
  const html = '<meta name="description" content="Have fun with the science of friction this September!"><meta property="og:image" content="https://images.example/motat.jpg"><main><h1>September Holiday Experience</h1><div>Date &amp; Time</div><div>26 Sep - 11 Oct 2026</div><div>Location MOTAT</div></main>';
  const result = extractAnnouncements("motat", html, "https://motat.nz/events/septemebr-holiday-experience-2026/");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "September Holiday Experience");
  assert.equal(result[0]?.date, "2026-09-26");
  assert.equal(result[0]?.endDate, "2026-10-11");
  assert.equal(result[0]?.imageUrl, "https://images.example/motat.jpg");
  assert.match(result[0]?.summary ?? "", /science of friction/);
});
test("Basement What's On extracts fixed future show ranges and skips undated weekly repeats", () => {
  const html = '<div class="tw-col"><h2>October</h2><a href="/blogs/whats-on/a-becoming"><div><img src="//basementtheatre.co.nz/cdn/show.jpg"><h3>A Becoming</h3><h3>1-3 OCT, 6:30PM</h3></div></a><a href="/blogs/whats-on/bull-rush-2026"><div><h3>Bull Rush</h3><h3>Every Friday, 10PM</h3></div></a></div>';
  const result = extractAnnouncements("basement-theatre", html, "https://basementtheatre.co.nz/blogs/whats-on");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "A Becoming");
  assert.equal(result[0]?.date, "2026-10-01");
  assert.equal(result[0]?.endDate, "2026-10-03");
  assert.equal(result[0]?.scheduleText, "6:30PM");
  assert.equal(result[0]?.imageUrl, "https://basementtheatre.co.nz/cdn/show.jpg");
});
test("Armageddon Auckland Spring extracts only the confirmed 2026 dates and links its official announcement", () => {
  const html = '<a href="/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/">Read more</a><section><h2>AUCKLAND SPRING 2026</h2><p>October 23/24/25/26th · Auckland Showgrounds</p></section>';
  const result = extractAnnouncements("armageddon-auckland", html, "https://www.armageddonexpo.com/");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    title: "Armageddon Expo Auckland Spring 2026",
    date: "2026-10-23",
    sourceUrl: "https://www.armageddonexpo.com/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/",
    precision: "day",
    sessionDates: ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"],
    endDate: "2026-10-26",
  });
  assert.equal(extractAnnouncements("armageddon-auckland", html.replace("AUCKLAND SPRING 2026", "AUCKLAND SPRING"), "https://www.armageddonexpo.com/").length, 0);
});
test("Armageddon Auckland Winter extracts its explicit 2027 dates and daily hours", () => {
  const html = '<main><h2>AUCKLAND WINTER 2027</h2><p>5th - 7th June at Auckland Showgrounds</p><p>10am to 5pm all days</p></main>';
  const result = extractAnnouncements("armageddon-auckland", html, "https://www.armageddonexpo.com/");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Armageddon Expo Auckland Winter 2027");
  assert.equal(result[0]?.date, "2027-06-05");
  assert.equal(result[0]?.endDate, "2027-06-07");
  assert.equal(result[0]?.scheduleText, "10am–5pm daily");
  assert.deepEqual(result[0]?.sessionDates, ["2027-06-05", "2027-06-06", "2027-06-07"]);
  assert.equal(extractAnnouncements("armageddon-auckland", html.replace("2027", ""), "https://www.armageddonexpo.com/").length, 0);
});
test("Armageddon announcement metadata prefers its poster over social icons", () => {
  const html = '<meta property="og:image" content="/theme/images/icons/icon_fb.png"><main><article><img src="/resources/images/picker/2026-auck-s-poster.JPG"></article></main>';
  assert.equal(extractPageMeta(html, "https://www.armageddonexpo.com/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/").imageUrl,
    "https://www.armageddonexpo.com/resources/images/picker/2026-auck-s-poster.JPG");
});
test("Armageddon detail metadata retains the event's full introduction", () => {
  const html = '<main><div class="container content"><p>Get ready for the Auckland Showgrounds event over October 23-26th.</p><p>Gaming experiences include a virtual reality arcade,<br>racing zone and esports arena.</p><p>There will be huge trading card zones and many exhibitors.</p><p>Special events include cosplay parades, K-pop showcase and trading card tournaments.</p><p>Celebrity guests include actors, game voices and animation guests.</p><p>Tickets go on sale soon.</p></div></main>';
  const summary = extractPageMeta(html, "https://www.armageddonexpo.com/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/").summary ?? "";
  assert.match(summary, /Gaming experiences include/);
  assert.match(summary, /arcade, racing zone/);
  assert.match(summary, /trading card zones/);
  assert.match(summary, /cosplay parades/);
  assert.match(summary, /\n\n/);
  assert.doesNotMatch(summary, /Tickets go on sale soon/);
});
test("page metadata keeps official HTTPS images and descriptions", () => {
  const result = extractPageMeta('<meta property="og:image" content="/media/show.jpg"><meta property="og:description" content="A full official introduction to this upcoming Auckland performance and its artists.">', "https://venue.example/shows/one");
  assert.deepEqual(result, { imageUrl: "https://venue.example/media/show.jpg", summary: "A full official introduction to this upcoming Auckland performance and its artists." });
  assert.deepEqual(extractPageMeta('<meta property="og:image" content="javascript:alert(1)">', "https://venue.example/shows/one"), {});
});
test("Auckland Live prefers the real Show description over its SEO template", () => {
  const html = '<meta property="og:description" content="Experience James at The Civic. Visit aucklandlive.co.nz to find out about the best shows and events in Auckland."><section class="text-content-block"><div class="content-primary"><p>With over 30 million albums sold, James return to New Zealand to perform Laid and a career-spanning set.</p><p>The influential Manchester band are known for their distinctive vocals and genre experimentation.</p></div></section>';
  const meta = extractPageMeta(html, "https://www.aucklandlive.co.nz/show/james-2026");
  assert.match(meta.summary ?? "", /^With over 30 million albums sold/);
  assert.doesNotMatch(meta.summary ?? "", /^Experience James/);
});
test("Spark Arena prefers official rich event copy over its ticket SEO template", () => {
  const html = '<meta name="description" content="Find Jason Derulo tickets at www.sparkarena.co.nz | Videos, biography, tour dates, performance times."><div data-component="ContentRichTextModule"><p>Global superstar Jason Derulo returns to New Zealand with The Last Dance World Tour.</p><p>Fans in Auckland can experience his hit-filled arena show live.</p></div>';
  const meta = extractPageMeta(html, "https://www.sparkarena.co.nz/all-events/jason-derulo-tickets-ae76866");
  assert.match(meta.summary ?? "", /^Global superstar Jason Derulo/);
  assert.doesNotMatch(meta.summary ?? "", /^Find Jason Derulo tickets/);
});
test("Spark Arena prefers the expanded event introduction over its short promo block", () => {
  const html = '<div id="extraInfo-1628332"><div class="MuiTypography-paragraph"><p>Conan Gray is a Texas born global pop artist whose emotionally honest songwriting has made him a defining voice of his generation.</p><p>His acclaimed albums blend intimate storytelling with arena ready pop.</p></div></div><div data-component="ContentRichTextModule"><p>Conan Gray’s Wishbone World Tour sails into Auckland next September! Tickets on sale Friday at 9am.</p></div>';
  const meta = extractPageMeta(html, "https://www.sparkarena.co.nz/all-events/conan-gray-tickets-ae1255137");
  assert.match(meta.summary ?? "", /^Conan Gray is a Texas born global pop artist/);
  assert.doesNotMatch(meta.summary ?? "", /^Conan Gray’s Wishbone World Tour sails/);
});
test("Auckland Live show pages retain concrete performance dates and times from official JSON-LD", () => {
  const performances = [
    { "@type": ["Event", "PerformingArtsEvent"], startDate: "2026-09-26T11:30:00+12:00" },
    { "@type": ["Event", "PerformingArtsEvent"], startDate: "2026-10-01T10:00:00+13:00" },
    { "@type": ["Event", "PerformingArtsEvent"], startDate: "2026-10-01T11:30:00+13:00" },
  ];
  const html = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": performances })}</script>`;
  const meta = extractPageMeta(html, "https://www.aucklandlive.co.nz/show/the-civic-tours");
  assert.deepEqual(meta.sessionDates, ["2026-09-26", "2026-10-01"]);
  assert.equal(meta.scheduleText, "11:30 am / 10:00 am");
});
test("detail summaries retain long official copy for the in-app detail page", () => {
  const paragraph = "A detailed official event description with artist history and programme information. ".repeat(8);
  const meta = extractPageMeta(`<main><p>${paragraph}</p></main>`, "https://venue.example/event");
  assert.ok((meta.summary?.length ?? 0) > 320);
});
test("JSON-LD Event descriptions outrank date-only SEO descriptions", () => {
  const html = `<meta property="og:description" content="2-4 October 2026"><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Event", description: "Graduating dancers present bold new contemporary works by the next generation of Aotearoa artists." }] })}</script>`;
  assert.match(extractPageMeta(html, "https://qtheatre.co.nz/shows/body-re-body").summary ?? "", /^Graduating dancers/);
});

test("gallery Event detail copy outranks generic institution metadata", () => {
  const html = '<meta name="description" content="Auckland Art Gallery Toi o Tāmaki is the largest art institution in New Zealand, with a collection numbering over 15,000 works."><div><div><h5>Event detail</h5></div><div class="rich-editor-content"><p>Join this welcoming weekly drawing class with a life model in a relaxed Gallery environment.</p><p>All experience levels are welcome and drawing materials are provided.</p></div></div>';
  assert.match(extractPageMeta(html, "https://www.aucklandartgallery.com/visit/events/drawing").summary ?? "", /^Join this welcoming/);
});

test("date-only SEO copy falls through to real body copy", () => {
  const html = '<meta name="description" content="Friday 30 October 2026"><main><p>The BLACKCAPS and India will play a blockbuster international match at Eden Park this year.</p></main>';
  assert.match(extractPageMeta(html, "https://edenpark.co.nz/events/match").summary ?? "", /^The BLACKCAPS/);
});
test("Eden Park keeps event copy and drops membership and address boilerplate", () => {
  const html = '<meta name="description" content="Sunday 28 February 2027"><body><p>Support the Blues in round 3 of Super Rugby Pacific as they take on the Crusaders at Eden Park.</p><p>An Eden Park membership gives you guaranteed entry and access to exclusive member bars.</p><p>Eden Park42 Reimers Ave, Kingsland, Auckland, New Zealand</p></body>';
  const summary = extractPageMeta(html, "https://edenpark.co.nz/events/blues-v-crusaders/").summary ?? "";
  assert.match(summary, /^Support the Blues/);
  assert.doesNotMatch(summary, /membership|Reimers/);
});
test("Q sessions use NZ calendar day, not UTC midnight", () => {
  const items = extractAnnouncements("q-theatre", '<h1>Show</h1><div class="meta__date-items"><time datetime="2026-10-03T00:30:00+13:00">Sat</time></div>', "https://qtheatre.co.nz/shows/show");
  assert.equal(items[0]?.date, "2026-10-03");
});
test("Powerstation associates each date with its own title and source", () => {
  const items = extractAnnouncements("powerstation", '<li class="show"><h2>Band A</h2><time datetime="2026-10-03T07:00:00Z"></time><a class="ab--cover" href="/shows/a">Tickets</a></li>', "https://www.powerstation.net.nz/shows/coming");
  assert.equal(items[0]?.title, "Band A");
  assert.equal(items[0]?.sourceUrl, "https://www.powerstation.net.nz/shows/a");
  assert.equal(extractAnnouncements("powerstation", '<li class="show"><h2>Saturday 3 October 2026</h2><time datetime="2026-10-03T07:00:00Z"></time><a class="ab--cover" href="/shows/a">Tickets</a></li>', "https://www.powerstation.net.nz/shows/a").length, 0);
});
test("Eden Park never infers year or turns a range into an individual session", () => {
  const item = (date: string) => `<div class="event-item"><a href="/events/a"><h3>Match</h3><p class="event-date">${date}</p></a></div>`;
  assert.equal(extractAnnouncements("eden-park", item("Saturday 10 October 2026"), "https://edenpark.co.nz/events/")[0]?.date, "2026-10-10");
  assert.equal(extractAnnouncements("eden-park", item("10 October"), "https://edenpark.co.nz/events/").length, 0);
  assert.equal(extractAnnouncements("eden-park", item("Thursday 12 – Sunday 15 November 2026"), "https://edenpark.co.nz/events/").length, 0);
});
test("Auckland Art Gallery uses visible NZ dates instead of its offset JSON-LD date", () => {
  const html = `<main><h4>Gallery Talk</h4><div><p>10 Oct 2026</p></div><script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Gallery Talk", description: "An official introduction to the artists and ideas in this gallery programme.", startDate: "2026-10-09" })}</script></main>`;
  const items = extractAnnouncements("auckland-art-gallery", html, "https://www.aucklandartgallery.com/visit/events/gallery-talk");
  assert.equal(items[0]?.date, "2026-10-10");
  assert.equal(items[0]?.summary, "An official introduction to the artists and ideas in this gallery programme.");
});

test("Auckland Art Gallery listing cards preserve published date ranges and images", () => {
  const html = '<a href="/visit/events/family-day"><img src="https://cdn.example/family.jpg"><h5>Family Day</h5><p>Festival</p><p>17 Oct 2026 - 18 Oct 2026</p><p>Weekends 11am to 3pm</p></a>';
  const item = extractAnnouncements("auckland-art-gallery", html, "https://www.aucklandartgallery.com/visit/events")[0];
  assert.deepEqual(item, { title: "Family Day", date: "2026-10-17", endDate: "2026-10-18", sourceUrl: "https://www.aucklandartgallery.com/visit/events/family-day", precision: "day", imageUrl: "https://cdn.example/family.jpg", scheduleText: "Weekends 11am to 3pm" });
});
test("Auckland Art Gallery detail pages retain recurrence text and concrete session dates", () => {
  const html = '<main><h4>Weekly Drawing</h4><p>31 Jul 2026 - 25 Jun 2027</p><p>Fridays 11:30am to 12:10pm</p><p>Fri, 16 Oct 2026, 11:30 am – 12:10 pm</p><p>Fri, 23 Oct 2026, 11:30 am – 12:10 pm</p></main>';
  const item = extractAnnouncements("auckland-art-gallery", html, "https://www.aucklandartgallery.com/visit/events/weekly-drawing")[0];
  assert.equal(item?.scheduleText, "Fridays 11:30am to 12:10pm");
  assert.deepEqual(item?.sessionDates, ["2026-10-16", "2026-10-23"]);
});
