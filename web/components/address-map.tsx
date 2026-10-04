"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { MapProps } from "./address-map-gl";
import { DEFAULT_MAP_VIEW, MAP_VIEW_STORAGE_KEY, initialMapView, type MapView } from "@/lib/map-view";

/* The map library (~250 KB gz) loads only in the browser, after the page. */
const MapGL = dynamic(() => import("./address-map-gl"), {
  ssr: false,
  loading: () => <div className="addr-map addr-map-loading" aria-hidden="true" />,
});

/* The Google 3D view: its code and the Google script load only on the first switch to 3D. */
const Map3D = dynamic(() => import("./address-map-3d"), {
  ssr: false,
  loading: () => <div className="addr-map addr-map-3d addr-map-loading" aria-hidden="true" />,
});

function readStored(): string | null {
  try {
    return window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(v: MapView) {
  try {
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, v);
  } catch {}
}

const noSubscribe = () => () => {};

/** The view this visitor opens with: `?map=3d`, else their stored choice, else the default. */
function useInitialView(): MapView {
  return useSyncExternalStore(
    noSubscribe,
    () => initialMapView(new URLSearchParams(window.location.search).get("map"), readStored()),
    () => DEFAULT_MAP_VIEW,
  );
}

export default function AddressMap(props: MapProps) {
  const initial = useInitialView();
  const [picked, setPicked] = useState<MapView | null>(null);
  // Each view mounts on first use and then stays mounted (hidden), so switching back keeps its
  // state and the Google map is not loaded twice.
  const [used, setUsed] = useState<Record<MapView, boolean>>({ map: false, "3d": false });
  const [failed, setFailed] = useState<string | null>(null);

  const view = picked ?? initial;
  const shown: MapView = failed ? "map" : view;

  const pick = (v: MapView) => {
    if (v === "3d" && failed) return;
    setUsed((u) => ({ ...u, [shown]: true, [v]: true }));
    setPicked(v);
    store(v);
  };

  const onFail = (reason: string) => {
    console.warn(`3D map unavailable (${reason}); showing the map`);
    setFailed(reason);
  };

  const noMap = !props.coords && !props.outline;

  return (
    <div className="addr-map-views" data-view={shown}>
      {!noMap && (
        <div className="seg map-seg" role="group" aria-label="Map view">
          <button type="button" className="seg-item" aria-pressed={shown === "map"} onClick={() => pick("map")}>
            Map
          </button>
          <button
            type="button"
            className="seg-item"
            aria-pressed={shown === "3d"}
            aria-disabled={failed ? true : undefined}
            aria-label={failed ? "3D (not available here)" : "3D view"}
            onClick={() => pick("3d")}
          >
            3D
          </button>
        </div>
      )}
      {(used.map || shown === "map") && (
        <div className="addr-map-view" hidden={shown !== "map"}>
          <MapGL {...props} />
        </div>
      )}
      {(used["3d"] || shown === "3d") && !failed && (
        <div className="addr-map-view" hidden={shown !== "3d"}>
          <Map3D {...props} onFail={onFail} />
        </div>
      )}
      <p className="sr" role="status">
        {failed ? "3D view not available here; showing the map." : ""}
      </p>
    </div>
  );
}
