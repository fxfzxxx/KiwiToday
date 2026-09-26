import { VENUE_SOURCES } from "./catalog";
import { crawlVenue } from "./crawl";
const venue = VENUE_SOURCES.find((item) => item.slug === process.argv[2]);
if (!venue) throw new Error("Unknown venue");
process.stdout.write(JSON.stringify(await crawlVenue(venue, { days: Number(process.argv[3]) })));
