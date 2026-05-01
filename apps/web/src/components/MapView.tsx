"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type GeoFeature = {
  id: string;
  type: string;
  label: string;
  lat: number;
  lon: number;
};

const NZ_CENTRE: [number, number] = [173.5, -41.0];

export function MapView({ features, onSelect }: { features: GeoFeature[]; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    mapRef.current = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: NZ_CENTRE,
      zoom: 4.6,
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    for (const f of features) {
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.background = "#3DD9D6";
      el.style.border = "1.5px solid #0B1220";
      el.style.cursor = "pointer";
      el.title = f.label;
      el.addEventListener("click", () => onSelect(f.id));
      markers.push(new maplibregl.Marker(el).setLngLat([f.lon, f.lat]).addTo(map));
    }
    return () => { markers.forEach(m => m.remove()); };
  }, [features, onSelect]);

  return <div ref={ref} className="h-full w-full" />;
}
