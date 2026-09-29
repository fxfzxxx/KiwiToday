/** Official entry points; crawl results, not this directory, establish coverage. */
export const VENUE_SOURCES: readonly VenueSource[] = [
  { slug: "armageddon-auckland", name: "Auckland Showgrounds", city: "auckland", seeds: ["https://www.armageddonexpo.com/"], linkPrefixes: ["/armageddon-updates/the-epic-expo-is-back-for-labour-weekend/"], maxPages: 2 },
  { slug: "card-merchant-westcity", name: "Card Merchant WestCity", city: "auckland", seeds: ["https://cardmerchant.co.nz/"], linkPrefixes: ["/"], maxPages: 1 },
  { slug: "cosmos-con-auckland", name: "Auckland Netball Centre", city: "auckland", seeds: ["https://cosmosnz.org/cosmos-con-2027/"], linkPrefixes: ["/cosplay-competition-2027/"], maxPages: 1 },
  { slug: "grand-archive-ascent-auckland", name: "Alexandra Park Raceway", city: "auckland", seeds: ["https://www.eventbrite.com/e/grand-archive-tcg-ascent-auckland-2027-tickets-2001275411629"], linkPrefixes: ["/e/grand-archive-tcg-ascent-auckland-2027-tickets-"], maxPages: 1 },
  { slug: "spark-arena", name: "Spark Arena", city: "auckland", seeds: ["https://www.sparkarena.co.nz/"], linkPrefixes: ["/all-events/"], maxPages: 12 },
  { slug: "auckland-town-hall", name: "Auckland Town Hall", city: "auckland", seeds: ["https://www.aucklandlive.co.nz/venue/auckland-town-hall"], linkPrefixes: ["/show/"], maxPages: 40 },
  { slug: "asb-waterfront", name: "ASB Waterfront Theatre", city: "auckland", seeds: ["https://www.atc.co.nz/asb-waterfront-theatre"], linkPrefixes: ["/shows/", "/2026/", "/2027/"], maxPages: 12 },
  { slug: "auckland-art-gallery", name: "Auckland Art Gallery", city: "auckland", seeds: ["https://www.aucklandartgallery.com/visit/events", "https://www.aucklandartgallery.com/visit/events?page=2"], linkPrefixes: ["/visit/events/"], maxPages: 25 },
  { slug: "the-civic", name: "The Civic", city: "auckland", seeds: ["https://www.aucklandlive.co.nz/venue/the-civic"], linkPrefixes: ["/show/"], maxPages: 40 },
  { slug: "aotea-centre", name: "Aotea Centre", city: "auckland", seeds: ["https://www.aucklandlive.co.nz/venue/aotea-centre"], linkPrefixes: ["/show/"], maxPages: 40 },
  { slug: "bruce-mason", name: "Bruce Mason Centre", city: "auckland", seeds: ["https://www.aucklandlive.co.nz/venue/bruce-mason-centre"], linkPrefixes: ["/show/"], maxPages: 40 },
  { slug: "tuning-fork", name: "The Tuning Fork", city: "auckland", seeds: ["https://www.tuningfork.co.nz/"], linkPrefixes: ["/all-events/", "/whats-on/"], maxPages: 12 },
  { slug: "powerstation", name: "Powerstation", city: "auckland", seeds: ["https://www.powerstation.net.nz/shows/coming"], linkPrefixes: ["/shows/"], maxPages: 35 },
  { slug: "basement-theatre", name: "Basement Theatre", city: "auckland", seeds: ["https://basementtheatre.co.nz/"], linkPrefixes: ["/whats-on/", "/events/", "/whats-on"], maxPages: 12 },
  { slug: "q-theatre", name: "Q Theatre", city: "auckland", seeds: ["https://qtheatre.co.nz/"], linkPrefixes: ["/shows/", "/whats-on"], maxPages: 20 },
  { slug: "eden-park", name: "Eden Park", city: "auckland", seeds: ["https://edenpark.co.nz/events/"], linkPrefixes: ["/events/"], maxPages: 25 },
  { slug: "go-media-stadium", name: "Go Media Stadium", city: "auckland", seeds: ["https://www.aucklandstadiums.co.nz/our-venues/go-media-stadium"], linkPrefixes: ["/event/", "/events/"], maxPages: 12 },
  { slug: "western-springs", name: "Western Springs Bowl", city: "auckland", seeds: ["https://www.westernspringsbowl.co.nz/"], linkPrefixes: ["/event/", "/events/"], maxPages: 12 },
  { slug: "eventfinda-stadium", name: "Eventfinda Stadium", city: "auckland", seeds: ["https://www.eventfindastadium.co.nz/"], linkPrefixes: ["/events/", "/event/", "/whats-on"], maxPages: 12 },
  { slug: "auckland-museum", name: "Auckland Museum", city: "auckland", seeds: ["https://www.aucklandmuseum.com/"], linkPrefixes: ["/visit/whats-on", "/visit/exhibitions"], maxPages: 12 },
  { slug: "motat", name: "MOTAT", city: "auckland", seeds: ["https://motat.nz/"], linkPrefixes: ["/events/", "/experiences/", "/exhibitions/"], maxPages: 12 },
  { slug: "stardome", name: "Stardome", city: "auckland", seeds: ["https://www.stardome.org.nz/"], linkPrefixes: ["/events/", "/shows/", "/whats-on"], maxPages: 12 },
  { slug: "auckland-zoo", name: "Auckland Zoo", city: "auckland", seeds: ["https://www.aucklandzoo.co.nz/"], linkPrefixes: ["/events/", "/event/", "/visit/"], maxPages: 12 },
  { slug: "maritime-museum", name: "New Zealand Maritime Museum", city: "auckland", seeds: ["https://www.maritimemuseum.co.nz/"], linkPrefixes: ["/events/", "/event/", "/whats-on"], maxPages: 12 },
] as const;

export interface VenueSource {
  slug: string;
  name: string;
  city: string;
  seeds: readonly string[];
  linkPrefixes: readonly string[];
  maxPages: number;
}
