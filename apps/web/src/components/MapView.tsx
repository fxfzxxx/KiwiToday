"use client";

import { getCity, type KiwiEvent } from "@kiwi/core";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre replaces the prototype's Leaflet + hand-rolled canvas heatmap.
 *
 * The prototype spent ~120 lines on a heatmap and a pin declutter pass. Both
 * are native here: `heatmap` is a GPU layer, and clustering collapses dense pins
 * without us measuring pixel distances by hand. The same layer spec also works
 * in @maplibre/maplibre-react-native when the app arrives.
 */
export function MapView({
  events, activeId, hoveredId, showHeat, city, onSelect, onViewportChange,
}: {
  events: KiwiEvent[];
  activeId: string | null;
  hoveredId: string | null;
  showHeat: boolean;
  city: string;
  onSelect: (id: string) => void;
  onViewportChange?: (bbox: [number, number, number, number]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);

  // Callbacks live in refs so the map is built once; re-creating it on every
  // parent render is the classic way to make a map flicker and lose state.
  const onSelectRef = useRef(onSelect);
  const onViewportRef = useRef(onViewportChange);
  onSelectRef.current = onSelect;
  onViewportRef.current = onViewportChange;

  useEffect(() => {
    if (!container.current || map.current) return;
    const home = getCity(city) ?? getCity("auckland")!;

    const m = new maplibregl.Map({
      container: container.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://demotiles.maplibre.org/style.json",
      center: [home.lng, home.lat],
      zoom: home.zoom,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    m.on("load", () => {
      m.addSource("events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 14,
      });

      m.addLayer({
        id: "events-heat",
        type: "heatmap",
        source: "events",
        layout: { visibility: "none" },
        paint: {
          // Popularity drives intensity, but log-ish weighting stops one
          // stadium show from washing out a whole city of markets.
          "heatmap-weight": ["interpolate", ["linear"], ["coalesce", ["get", "popularity"], 0], 0, 0.3, 4000, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 1, 15, 3],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 18, 15, 50],
          "heatmap-opacity": 0.75,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(30,138,95,0)", 0.3, "#1E8A5F", 0.65, "#0B6E99", 1, "#FF6B4A",
          ],
        },
      });

      m.addLayer({
        id: "clusters", type: "circle", source: "events", filter: ["has", "point_count"],
        paint: {
          "circle-color": "#08415C",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
          "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
        },
      });
      m.addLayer({
        id: "cluster-count", type: "symbol", source: "events", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });
      m.addLayer({
        id: "pins", type: "circle", source: "events", filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["case", ["get", "active"], "#FF6B4A", "#0B6E99"],
          "circle-radius": ["case", ["get", "active"], 9, 6],
          "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
        },
      });

      m.on("click", "pins", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      });
      m.on("click", "clusters", async (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId == null) return;
        const geometry = feature?.geometry;
        if (geometry?.type !== "Point") return;
        const src = m.getSource("events") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(Number(clusterId));
        m.easeTo({ center: geometry.coordinates as [number, number], zoom });
      });
      for (const layer of ["pins", "clusters"]) {
        m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; });
      }

      m.on("moveend", () => {
        const b = m.getBounds();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      });

      ready.current = true;
      m.resize();
    });

    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once on purpose
  }, []);

  // Feed data + highlight state into the source.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource("events") as GeoJSONSource | undefined;
    if (!src) return;

    src.setData({
      type: "FeatureCollection",
      features: events
        .filter((e) => e.point)
        .map((e) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [e.point!.lng, e.point!.lat] },
          properties: {
            id: e.id,
            popularity: e.popularity,
            active: e.id === activeId || e.id === hoveredId,
          },
        })),
    });
  }, [events, activeId, hoveredId]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.setLayoutProperty("events-heat", "visibility", showHeat ? "visible" : "none");
  }, [showHeat]);

  // Recentre when the city changes, but not on every data refresh — yanking the
  // viewport while someone is panning is maddening.
  useEffect(() => {
    const m = map.current;
    const home = getCity(city);
    if (!m || !ready.current || !home) return;
    m.easeTo({ center: [home.lng, home.lat], zoom: home.zoom });
  }, [city]);

  // Fly to a selection made in the list.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !activeId) return;
    const target = events.find((e) => e.id === activeId);
    if (target?.point) m.easeTo({ center: [target.point.lng, target.point.lat], duration: 500 });
  }, [activeId, events]);

  return <div ref={container} className="h-full w-full" />;
}
