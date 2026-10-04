"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MapProps } from "./address-map-gl";
import { APPROX_CAPTION, FOOTPRINT_ATTRIBUTION, MAP3D_TIMEOUT_MS, buildingCamera, cityCamera, highlightFor, outerRings, type Camera } from "@/lib/map-view";
import { HINT_SEEN_KEY, INTERACTION_EVENTS, afterDialogClose, hintText, map3dSettings, replayLabel, replayPlan, showHint } from "@/lib/map-ui";
import { icons } from "./icons";

/* Google Maps JavaScript 3D view (Map3DElement). Loaded only after the visitor picks "3D":
   this module and the Google script are fetched on first switch, never on page load.
   Any failure (no key, no WebGL, load error, timeout, no coverage) calls onFail and the
   caller shows the MapLibre map instead. Google attribution is left as the API renders it. */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const STROKE = "#0f766e";
const FILL = "rgba(15, 118, 110, 0.10)";
const BLDG_FILL = "rgba(20, 184, 166, 0.6)";
const APPROX_FILL = "rgba(20, 184, 166, 0.28)";
const APPROX_STROKE = "rgba(15, 118, 110, 0.6)";
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

function setCamera(map: google.maps.maps3d.Map3DElement, cam: Camera) {
  map.center = cam.center;
  map.range = cam.range;
  map.tilt = cam.tilt;
  map.heading = cam.heading;
}

/** Fly from wherever the camera is to `end`, then orbit it once. */
function flyIn(map: google.maps.maps3d.Map3DElement, end: Camera, alive: () => boolean) {
  map.addEventListener(
    "gmp-animationend",
    () => {
      if (alive()) map.flyCameraAround({ camera: end, durationMillis: ORBIT_MS, repeatCount: 1 });
    },
    { once: true },
  );
  map.flyCameraTo({ endCamera: end, durationMillis: FLY_MS });
}

function readHintSeen(): string | null {
  try {
    return window.localStorage.getItem(HINT_SEEN_KEY);
  } catch {
    return null;
  }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export type Map3DProps = MapProps & { onFail: (reason: string) => void };

export default function AddressMap3D({ coords: geocode, outline, footprint, elevation_m, caption, label, onFail }: Map3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const enlargeBtn = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const replayRef = useRef<() => void>(() => {});
  const failRef = useRef(onFail);
  const [ready, setReady] = useState(false);
  const [big, setBig] = useState(false);
  // Client-only component (dynamic, ssr: false), so window is there on the first render.
  const [reduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hint, setHint] = useState(() =>
    showHint(readHintSeen(), false) ? hintText(window.matchMedia("(pointer: coarse)").matches) : null,
  );
  useEffect(() => {
    failRef.current = onFail;
  });

  // The map's <dialog> is shown inline on the card; enlarging makes the same element modal.
  // Layout effect, so the map's host has its size before the map effect below runs.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.show();
  }, []);

  // First view: a one-line gesture hint under the card, gone after the first interaction.
  useEffect(() => {
    const el = host.current;
    if (!el || !hint) return;
    setHint(hintText(window.matchMedia("(pointer: coarse)").matches));
    const seen = () => {
      setHint(null);
      try {
        window.localStorage.setItem(HINT_SEEN_KEY, "1");
      } catch {}
      for (const t of INTERACTION_EVENTS) el.removeEventListener(t, seen, true);
    };
    for (const t of INTERACTION_EVENTS) el.addEventListener(t, seen, { capture: true, passive: true });
    return () => {
      for (const t of INTERACTION_EVENTS) el.removeEventListener(t, seen, true);
    };
  }, [hint]);

  // Card: cooperative gestures; enlarged: greedy gestures and Google's controls.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    Object.assign(m, map3dSettings(big ? "dialog" : "card"));
  }, [big, ready]);

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

    const hl = highlightFor(geocode, footprint);
    const coords = hl ? hl.center : null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rings = outerRings(outline?.geometry as never);
    const end = coords ? buildingCamera(coords, elevation_m) : null;
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
      const { Map3DElement, Polygon3DElement } = lib;
      const first = reduce && end ? end : start;
      map = new Map3DElement({
        ...first,
        mode: "SATELLITE",
        ...map3dSettings("card"),
      });
      mapRef.current = map;
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
      if (hl?.kind === "building") {
        // Sure match: the building itself, its OSM outline extruded to its height, visible through
        // other buildings. A few metres above the OSM height so the roof clears Google's mesh.
        const h = hl.footprint.height_m + 3;
        const bldg = new Polygon3DElement({
          strokeColor: STROKE,
          strokeWidth: 4,
          fillColor: BLDG_FILL,
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          drawsOccludedSegments: true,
        });
        bldg.path = hl.ring.map(([lng, lat]) => ({ lat, lng, altitude: h }));
        map.append(bldg);
      } else if (hl?.kind === "approx") {
        // No sure building: a soft circle around the geocode, draped on the ground.
        const circle = new Polygon3DElement({
          strokeColor: APPROX_STROKE,
          strokeWidth: 2,
          fillColor: APPROX_FILL,
          altitudeMode: "CLAMP_TO_GROUND",
          drawsOccludedSegments: true,
        });
        circle.path = hl.ring.map(([lng, lat]) => ({ lat, lng }));
        map.append(circle);
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
        setReady(true);
        if (!end || reduce) return;
        flyIn(map, end, () => !done);
      };
      // ↻: jump back to the city shot and fly in again (reduced motion: straight to the building).
      replayRef.current = () => {
        const m = map;
        const step = replayPlan(start, end, reduce);
        if (!m || done || !step) return;
        try {
          m.stopCameraAnimation();
        } catch {}
        if (step.kind === "jump") return setCamera(m, step.camera);
        setCamera(m, step.from);
        const to = step.to;
        let started = false;
        const go = () => {
          if (started || done) return;
          started = true;
          m.removeEventListener("gmp-steadychange", onSteady);
          flyIn(m, to, () => !done);
        };
        const onSteady = (ev: Event) => {
          if ((ev as Event & { isSteady?: boolean }).isSteady) go();
        };
        m.addEventListener("gmp-steadychange", onSteady);
        setTimeout(go, 1500);
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
      mapRef.current = null;
      replayRef.current = () => {};
      setReady(false);
    };
  }, [geocode, outline, footprint, elevation_m, label]);

  const target = highlightFor(geocode, footprint);
  const building = target?.kind === "building";
  const replayName = replayLabel(reduce, !!target);
  const where = geocode ? `3D map: ${label}. ${caption}.` : `3D map of city limits. ${caption}.`;

  const enlarge = () => {
    const d = dialog.current;
    if (!d) return;
    d.close();
    d.showModal();
    setBig(true);
  };
  const onClose = () => {
    const d = dialog.current;
    if (!d || afterDialogClose(d.open) === "keep") return;
    d.show();
    setBig(false);
    enlargeBtn.current?.focus();
  };

  return (
    <figure className="addr-map-figure">
      <dialog ref={dialog} className="addr-map-3d-dialog" onClose={onClose} aria-label={big ? `Larger 3D map: ${label}` : undefined}>
        {/* Shown only while modal (CSS); first in the dialog, so it takes focus on enlarge. */}
        <div className="addr-map-dialog-head">
          <span>
            {caption}
            {building && <span className="map-osm-attr">{FOOTPRINT_ATTRIBUTION}</span>}
          </span>
          <button type="button" onClick={() => dialog.current?.close()} className="addr-map-close">
            Close
          </button>
        </div>
        <div className="addr-map-wrap">
          <div ref={host} className="addr-map addr-map-3d" role="img" aria-label={where} />
          <div className="addr-map-tools">
            {/* Kept mounted while enlarged (hidden by CSS); focus returns to it on close. */}
            <button ref={enlargeBtn} type="button" className="addr-map-tool addr-map-tool-enlarge" onClick={enlarge} aria-label="Enlarge 3D map" title="Enlarge">
              {icons.expand}
            </button>
            {ready && (
              <button type="button" className="addr-map-tool" onClick={() => replayRef.current()} aria-label={replayName} title={replayName}>
                {icons.replay}
              </button>
            )}
          </div>
        </div>
      </dialog>
      {hint && !big && (
        <p className="addr-map-gesture-hint" aria-hidden="true">
          {hint}
        </p>
      )}
      <figcaption className="map-caption">
        <strong>{caption}</strong>
        {!geocode && <> · no pin: the geocoder found no location for this address</>}
        {geocode && !building && <> · {APPROX_CAPTION}</>}
        {building && <span className="map-osm-attr">{FOOTPRINT_ATTRIBUTION}</span>}
      </figcaption>
    </figure>
  );
}
