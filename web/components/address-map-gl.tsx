"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { APPROX_CAPTION, FOOTPRINT_ATTRIBUTION, highlightFor } from "@/lib/map-view";
import type { Footprint } from "@/lib/footprint";

/* Real base map: MapLibre GL + OpenFreeMap vector tiles (Positron, no key). */

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ACCENT = "#2B3B4E";
const BLDG = "#0f766e";

// Worker files are copied to /public/maplibre by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MapProps = {
  /** Building location; null when the geocoder found none (outline only). */
  coords: { lon: number; lat: number } | null;
  /** Legal city limits (GeoJSON feature); null for unincorporated addresses. */
  outline: GeoJSON.Feature | null;
  caption: string;
  label: string;
  /** OSM building outline matched to the address (sample addresses only); null/absent → pin on the geocode. */
  footprint?: Footprint | null;
};

type Ring = number[][];

function outlineBounds(outline: GeoJSON.Feature): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds();
  const g = outline.geometry;
  const polys: Ring[][] =
    g.type === "Polygon" ? [g.coordinates as Ring[]] : g.type === "MultiPolygon" ? (g.coordinates as Ring[][]) : [];
  for (const poly of polys) for (const [lon, lat] of poly[0]) b.extend([lon, lat]);
  return b;
}

function useMap(
  container: React.RefObject<HTMLDivElement | null>,
  { coords: geocode, outline, footprint }: Pick<MapProps, "coords" | "outline" | "footprint">,
  interactive: boolean,
  active: boolean,
) {
  useEffect(() => {
    const el = container.current;
    if (!el || !active) return;
    // Sure building match: outline + pin on its centroid. Otherwise a soft circle around the
    // street-interpolated geocode, pin on the geocode.
    const hl = highlightFor(geocode, footprint);
    const coords = hl ? hl.center : null;
    const building = hl?.kind === "building";
    const map = new maplibregl.Map({
      container: el,
      style: STYLE,
      center: coords ? [coords.lon, coords.lat] : [-98, 39],
      zoom: coords ? 13 : 3,
      interactive,
      attributionControl: { compact: false, customAttribution: building ? FOOTPRINT_ATTRIBUTION : undefined },
      cooperativeGestures: false,
    });
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (outline) {
        map.addSource("city", { type: "geojson", data: outline });
        map.addLayer({ id: "city-fill", type: "fill", source: "city", paint: { "fill-color": ACCENT, "fill-opacity": 0.06 } });
        map.addLayer({
          id: "city-line",
          type: "line",
          source: "city",
          paint: { "line-color": ACCENT, "line-width": 2, "line-opacity": 0.85 },
        });
      }
      if (hl) {
        map.addSource("hl", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hl.ring] } },
        });
        map.addLayer({
          id: "hl-fill",
          type: "fill",
          source: "hl",
          paint: { "fill-color": BLDG, "fill-opacity": building ? 0.25 : 0.18 },
        });
        map.addLayer({
          id: "hl-line",
          type: "line",
          source: "hl",
          paint: building ? { "line-color": BLDG, "line-width": 2 } : { "line-color": BLDG, "line-width": 1, "line-opacity": 0.5 },
        });
      }
    });
    if (coords) new maplibregl.Marker({ color: ACCENT }).setLngLat([coords.lon, coords.lat]).addTo(map);

    // Frame: the building at neighbourhood zoom, so a part of the city line shows nearby.
    // Without a pin, the whole (land-only) city outline.
    if (coords) {
      // The enlarged map opens close enough to see the building outline or the approximate circle.
      map.jumpTo({ center: [coords.lon, coords.lat], zoom: interactive ? 16 : 11.8 });
    } else if (outline) {
      map.fitBounds(outlineBounds(outline), { padding: interactive ? 40 : 16, animate: false });
    }
    // Light loading state until the first tiles have drawn.
    el.setAttribute("data-loading", "true");
    map.once("idle", () => el.removeAttribute("data-loading"));
    // Containers can change size after mount (lazy layout, dialog opening): keep the canvas in step.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [container, geocode, outline, footprint, interactive, active]);
}

export default function AddressMapGL(props: MapProps) {
  const { caption, label, coords, outline, footprint } = props;
  const approx = highlightFor(coords, footprint)?.kind === "approx";
  const small = useRef<HTMLDivElement>(null);
  const large = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useMap(small, props, false, true);
  useMap(large, props, true, open);

  if (!coords && !outline) {
    return (
      <figure>
        <p className="map-caption">No map: no coordinates and no city limits for this address.</p>
      </figure>
    );
  }

  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
  };
  const where = coords ? `Map: ${label}. ${caption}.` : `Map of city limits, no pin for this address. ${caption}.`;

  return (
    <figure className="addr-map-figure">
      <div className="addr-map-wrap">
        <div ref={small} className="addr-map" role="img" aria-label={where} />
        <button type="button" className="addr-map-hit" onClick={show} aria-label="Enlarge map" />
        <span className="addr-map-hint" aria-hidden="true">Tap to enlarge</span>
      </div>
      <figcaption className="map-caption">
        <strong>{caption}</strong>
        {approx && <> · {APPROX_CAPTION}</>}
        {!coords && <> · no pin: the geocoder found no location for this address</>}
      </figcaption>
      <dialog ref={dialog} className="addr-map-dialog" onClose={() => setOpen(false)} aria-label={`Larger map: ${label}`}>
        <div className="addr-map-dialog-head">
          <span>{caption}</span>
          <button type="button" onClick={() => dialog.current?.close()} className="addr-map-close">
            Close
          </button>
        </div>
        <div ref={large} className="addr-map-large" />
      </dialog>
    </figure>
  );
}
