export interface VenueSnapshot {
  generatedAt: string;
  venues: {
    slug: string; name: string; city: string; url: string; checkedAt: string | null;
    status: "found" | "needs-extraction" | "failed" | "pending";
    pages: number; failedPages: number; truncated: boolean;
  }[];
  events: {
    id: string; venueSlug: string; title: string; date: string; endDate?: string;
    startsAt: string | null; sourceUrl: string; checkedAt: string;
    precision: "day" | "time";
    imageUrl?: string; summary?: string; scheduleText?: string; sessionDates?: string[];
  }[];
}
