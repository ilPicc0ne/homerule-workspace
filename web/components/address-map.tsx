"use client";

import dynamic from "next/dynamic";
import type { MapProps } from "./address-map-gl";

/* The map library (~250 KB gz) loads only in the browser, after the page. */
const MapGL = dynamic(() => import("./address-map-gl"), {
  ssr: false,
  loading: () => <div className="addr-map addr-map-loading" aria-hidden="true" />,
});

export default function AddressMap(props: MapProps) {
  return <MapGL {...props} />;
}
