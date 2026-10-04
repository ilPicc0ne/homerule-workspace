import "server-only";
import { getDataset, jurisdictionById } from "@/lib/data";
import { addressPageData, changeLogFor } from "@/lib/address-page-data.ts";
import { buildingFootprint, cityOutline, groundElevation, mapCaption } from "@/lib/outlines";
import { sureFootprint } from "@/lib/map-view";
import type { Address, Dataset, Result } from "@/lib/types";
import type { PageProps as ViewProps } from "./[id]/address-page";

/*
  Server side of the one-view address page: everything the client view needs, in one object.
  Used by /a/[id] (the 500 sample addresses, engine results) and /a/at (a typed address).
  The content (view, hero, change log) comes from lib/address-page-data.ts, shared with the MCP tools;
  this file adds the map and the search index.
*/

export { changeLogFor };

export function searchIndex(data: Dataset) {
  return data.addresses.map((a) => ({ id: a.address_id, street: a.street, city: a.postal_city, st: a.state_code }));
}

export function viewProps(data: Dataset, address: Address, results: Result[], extra?: { typed?: boolean; legalNote?: string; asOf?: string }): ViewProps {
  const core = addressPageData(data, address, results, extra);
  const city = address.jurisdictions.city ? jurisdictionById(address.jurisdictions.city) : undefined;
  const outline = cityOutline(city?.id) as GeoJSON.Feature | null;
  const mapCap = mapCaption(core.cityName, core.countyName ?? undefined, address.postal_city);

  return {
    id: core.id,
    view: core.view,
    hero: core.hero,
    map: {
      coords: address.coords,
      outline,
      caption: mapCap,
      label: address.street,
      // Only sure matches (geocode inside the outline) reach the browser; the rest get the approximate circle.
      footprint: extra?.typed ? null : sureFootprint(buildingFootprint(address.address_id)),
      // Ground elevation at the 3D camera target; typed addresses have none (3D falls back to top-down).
      elevation_m: extra?.typed ? null : groundElevation(address.address_id),
    },
    index: searchIndex(data),
    typed: core.typed,
    changeLog: core.changeLog,
  };
}

export { getDataset };
