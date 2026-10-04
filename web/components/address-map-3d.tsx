"use client";

import { useEffect, useRef } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MapProps } from "./address-map-gl";
import { MAP3D_TIMEOUT_MS, buildingCamera, cityCamera, outerRings } from "@/lib/map-view";

/* Google Maps JavaScript 3D view (Map3DElement). Loaded only after the visitor picks "3D":
   this module and the Google script are fetched on first switch, never on page load.
   Any failure (no key, no WebGL, load error, timeout, no coverage) calls onFail and the
   caller shows the MapLibre map instead. Google attribution is left as the API renders it. */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const STROKE = "#0f766e";
const FILL = "rgba(15, 118, 110, 0.10)";
const FLY_MS = 4000;
const ORBIT_MS = 24000;

let configured = false;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export type Map3DProps = MapProps & { onFail: (reason: string) => void };

export default function AddressMap3D({ coords, outline, caption, label, onFail }: Map3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let done = false;
    let map: google.maps.maps3d.Map3DElement | null = null;
    const fail = (reason: string) => {
      if (done) return;
      done = true;
      failRef.current(reason);
    };
    if (!KEY) return fail("no key");
    if (!hasWebGL()) return fail("no WebGL");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rings = outerRings(outline?.geometry as never);
    const end = coords ? buildingCamera(coords) : null;
    const start = cityCamera(rings, coords);
    if (!start) return fail("nothing to show");

    el.setAttribute("data-loading", "true");
    let steadyTimer: ReturnType<typeof setTimeout> | undefined;

    // Key rejected (referrer, quota, billing): Google calls this global, then greys the map.
    const w = window as Window & { gm_authFailure?: () => void };
    const prevAuth = w.gm_authFailure;
    w.gm_authFailure = () => {
      prevAuth?.();
      fail("key rejected");
    };

    // The 3D element does not call gm_authFailure: it greys itself out and logs
    // "Google Maps JavaScript API error: <Code>" (RefererNotAllowedMapError, ApiNotActivatedMapError,
    // InvalidKeyMapError, ...). Watch for that line while this view is mounted.
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      origError.apply(console, args);
      const m = typeof args[0] === "string" && args[0].match(/Google Maps JavaScript API error: (\w+)/);
      if (m) fail(m[1]);
    };

    (async () => {
      if (!configured) {
        setOptions({ key: KEY, v: "weekly" });
        configured = true;
      }
      const lib = await timeout(importLibrary("maps3d"), MAP3D_TIMEOUT_MS);
      if (done) return;
      const { Map3DElement, Marker3DElement, Polygon3DElement } = lib;
      const first = reduce && end ? end : start;
      map = new Map3DElement({
        ...first,
        mode: "SATELLITE",
        defaultUIHidden: true,
        gestureHandling: "COOPERATIVE",
      });
      map.className = "addr-map-3d-el";
      map.addEventListener("gmp-error", () => fail("map error"));

      for (const ring of rings) {
        const poly = new Polygon3DElement({
          strokeColor: STROKE,
          strokeWidth: 3,
          fillColor: FILL,
          altitudeMode: "CLAMP_TO_GROUND",
          drawsOccludedSegments: true,
        });
        poly.path = ring.map(([lng, lat]) => ({ lat, lng }));
        map.append(poly);
      }
      if (coords) {
        const pin = new Marker3DElement({
          position: { lat: coords.lat, lng: coords.lon, altitude: 30 },
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          label,
        });
        map.append(pin);
      }
      el.append(map);

      // Fly once the opening shot has drawn (first steady frame); on a slow network start
      // anyway after the timeout. A real load failure arrives as gmp-error or the import timeout.
      let flown = false;
      const fly = () => {
        if (flown || done || !map) return;
        flown = true;
        clearTimeout(steadyTimer);
        el.removeAttribute("data-loading");
        el.setAttribute("data-ready", "true");
        if (!end || reduce) return;
        const m = map;
        m.addEventListener(
          "gmp-animationend",
          () => {
            if (!done) m.flyCameraAround({ camera: end, durationMillis: ORBIT_MS, repeatCount: 1 });
          },
          { once: true },
        );
        m.flyCameraTo({ endCamera: end, durationMillis: FLY_MS });
      };
      steadyTimer = setTimeout(fly, MAP3D_TIMEOUT_MS);
      map.addEventListener("gmp-steadychange", (ev) => {
        if ((ev as Event & { isSteady?: boolean }).isSteady) fly();
      });
    })().catch((e: unknown) => fail(e instanceof Error ? e.message : "load error"));

    return () => {
      done = true;
      w.gm_authFailure = prevAuth;
      console.error = origError;
      clearTimeout(steadyTimer);
      try {
        map?.stopCameraAnimation();
      } catch {}
      map?.remove();
    };
  }, [coords, outline, label]);

  const where = coords ? `3D map: ${label}. ${caption}.` : `3D map of city limits. ${caption}.`;
  return (
    <figure className="addr-map-figure">
      <div ref={host} className="addr-map addr-map-3d" role="img" aria-label={where} />
      <figcaption className="map-caption">
        <strong>{caption}</strong>
        {!coords && <> · no pin: the geocoder found no location for this address</>}
      </figcaption>
    </figure>
  );
}
