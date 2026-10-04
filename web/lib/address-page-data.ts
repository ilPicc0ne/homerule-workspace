import { buildAddressView, type AddressView } from "./address-view.ts";
import { changes } from "./changes/data.ts";
import { endBadge, eventBadge, PAGE_BADGES } from "./changes/impact.ts";
import { builtYear, unitsText } from "./format.ts";
import { ancestry, jurisdictionById } from "./jurisdiction-tree.ts";
import type { Address, Dataset, Result, Rule } from "./types.ts";

/*
  Everything the one-view address page shows except the map and the search index: the view model (tiles,
  timeline, proposed bills), the hero (jurisdiction crumb, legal vs postal city, building facts and their
  source) and the change-log link. Pure, so /a/[id], /a/at (via app/a/view-props.ts) and the MCP tool
  get_address share presentation. Their typed-address result acquisition differs:
  /a/at attempts the live engine; MCP still uses the provisional fallback.
*/

export type Hero = { crumb: string[]; cap: string; capSub?: string; facts: { icon: string; text: string; cls?: string }[]; factSrc: string; state: string };

export type AddressPageData = {
  id: string;
  view: AddressView;
  hero: Hero;
  typed: boolean;
  /** The address's change log (/changes/[id]) and the rules it lists, so dated items can link to their old → new entry. */
  changeLog: { href: string; rules: string[] } | null;
  cityName: string | null;
  countyName: string | null;
};

export function changeLogFor(id: string): { href: string; rules: string[] } | null {
  const rec = changes.addresses[id];
  if (!rec) return null;
  const rules = new Set(rec.entries.flatMap((e) => e.changes.map((c) => c.team_rule_id)));
  return { href: `/changes/${encodeURIComponent(id)}`, rules: [...rules] };
}

export function addressPageData(data: Dataset, address: Address, results: Result[], extra?: { typed?: boolean; legalNote?: string; asOf?: string }): AddressPageData {
  const stack = new Set(Object.values(address.jurisdictions).filter(Boolean));
  const rules: Record<string, Rule> = {};
  for (const r of data.rules) if (stack.has(r.jurisdiction_id)) rules[r.rule_id] = r;

  const city = address.jurisdictions.city ? jurisdictionById(address.jurisdictions.city) : undefined;
  const county = jurisdictionById(address.jurisdictions.county);
  const state = jurisdictionById(address.jurisdictions.state);
  const cityName = city ? city.legal_name.replace(/ city$/, "") : null;
  const asOf = extra?.asOf ?? data.meta.default_as_of;

  const rec = extra?.typed ? null : (changes.addresses[address.address_id] ?? null);
  const view = buildAddressView({ address, results, rules, asOf, cityName: cityName ?? "", findings: data.findings, changes: { sources: changes.sources, rec } });
  // A history event gets a badge only from the same rule's diff change at this address (PAGE_BADGES, #72); an ending gets endBadge (#77).
  if (PAGE_BADGES && !extra?.typed) {
    for (const e of [...view.future, ...view.past]) e.badge = e.kind === "end" ? endBadge(rec, e.ruleId, e.date) : eventBadge(rec, e.ruleId, e.date);
  }

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

  return {
    id: address.address_id,
    view,
    hero: { crumb, cap, capSub, facts, factSrc, state: address.state_code },
    typed: !!extra?.typed,
    changeLog: extra?.typed ? null : changeLogFor(address.address_id),
    cityName,
    countyName: county?.legal_name ?? null,
  };
}
