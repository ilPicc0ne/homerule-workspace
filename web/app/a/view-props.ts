import "server-only";
import { ancestry, getDataset, jurisdictionById } from "@/lib/data";
import { buildAddressView } from "@/lib/address-view";
import { changes } from "@/lib/changes/data.ts";
import { builtYear, unitsText } from "@/lib/format";
import { cityOutline, mapCaption } from "@/lib/outlines";
import type { Address, Dataset, Result, Rule } from "@/lib/types";
import type { PageProps as ViewProps } from "./[id]/address-page";

/*
  Server side of the one-view address page: everything the client view needs, in one object.
  Used by /a/[id] (the 500 sample addresses, engine results) and /a/at (a typed address).
*/

export function searchIndex(data: Dataset) {
  return data.addresses.map((a) => ({ id: a.address_id, street: a.street, city: a.postal_city, st: a.state_code }));
}

/** The address's change log (/changes/[id]) and the rules it lists, so dated items can link to their old → new entry. */
export function changeLogFor(id: string): { href: string; rules: string[] } | null {
  const rec = changes.addresses[id];
  if (!rec) return null;
  const rules = new Set(rec.entries.flatMap((e) => e.changes.map((c) => c.team_rule_id)));
  return { href: `/changes/${encodeURIComponent(id)}`, rules: [...rules] };
}

export function viewProps(data: Dataset, address: Address, results: Result[], extra?: { typed?: boolean; legalNote?: string }): ViewProps {
  const stack = new Set(Object.values(address.jurisdictions).filter(Boolean));
  const rules: Record<string, Rule> = {};
  for (const r of data.rules) if (stack.has(r.jurisdiction_id)) rules[r.rule_id] = r;

  const city = address.jurisdictions.city ? jurisdictionById(address.jurisdictions.city) : undefined;
  const county = jurisdictionById(address.jurisdictions.county);
  const state = jurisdictionById(address.jurisdictions.state);
  const cityName = city ? city.legal_name.replace(/ city$/, "") : null;
  const asOf = data.meta.default_as_of;

  const view = buildAddressView({ address, results, rules, asOf, cityName: cityName ?? "", findings: data.findings });

  const crumb = (city ? ancestry(city.id) : [state, county].filter((j) => !!j)).map((j) => j!.legal_name.replace(/ city$/, ""));
  if (!city && county) crumb.push("Unincorporated area");
  const cap = cityName
    ? `Inside ${cityName} city limits — city and state rules apply.`
    : `Outside any city: unincorporated ${county?.legal_name ?? "county"} — state rules apply.`;
  const capSub = extra?.legalNote ?? address.legal_city_note ?? (cityName && address.postal_city && address.postal_city !== cityName ? `Your mail says ${address.postal_city}; ${cityName} law applies.` : undefined);

  // Building facts: shown plainly; an unknown fact is the dashed amber "not in our data" pill.
  const year = builtYear(address.facts.built);
  const units = unitsText(address.facts.units);
  const facts: { icon: string; text: string; cls?: string }[] = [
    year ? { icon: "i-cal", text: `Built ${year}` } : { icon: "g-q", text: "Year built: not in our data", cls: "unk key" },
    units ? { icon: "i-units", text: `${units} units` } : { icon: "g-q", text: "Units: not in our data", cls: "unk key" },
  ];
  if (address.facts.subsidised) facts.push({ icon: "i-building", text: "Listed as subsidised housing" });
  const factSrc = extra?.typed
    ? "Typed address: we have no property record for it, so building facts are unknown."
    : `Building facts from ${address.source.dataset}.${address.fact_sources.units?.source.includes("assumed") ? " Units are read from the use code (an estimate)." : ""}`;

  const outline = cityOutline(city?.id) as GeoJSON.Feature | null;
  const mapCap = mapCaption(cityName, county?.legal_name, address.postal_city);

  return {
    id: address.address_id,
    view,
    hero: { crumb, cap, capSub, facts, factSrc, state: address.state_code },
    map: { coords: address.coords, outline, caption: mapCap, label: address.street },
    index: searchIndex(data),
    typed: !!extra?.typed,
    changeLog: extra?.typed ? null : changeLogFor(address.address_id),
  };
}

export { getDataset };
