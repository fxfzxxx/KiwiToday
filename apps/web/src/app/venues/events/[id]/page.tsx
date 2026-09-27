import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { VenueSnapshot } from "@kiwi/core";
import { EventDetail } from "@/components/EventDetail";
import snapshotData from "@/data/venue-snapshot.json";

const snapshot = snapshotData as VenueSnapshot;

export function generateStaticParams() {
  return snapshot.events.map((event) => ({ id: event.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = snapshot.events.find((item) => item.id === id);
  return event ? { title: `${event.title} · KiwiToday`, description: event.summary ?? `${event.title} 活动详情` } : {};
}

export default async function VenueEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = snapshot.events.find((item) => item.id === id);
  if (!event) notFound();
  const venue = snapshot.venues.find((item) => item.slug === event.venueSlug);
  return <EventDetail event={event} venue={venue} snapshotGeneratedAt={snapshot.generatedAt} />;
}
