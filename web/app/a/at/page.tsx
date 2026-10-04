import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import { getDataset } from "@/lib/data";
import { resolveQuery } from "@/lib/resolve/resolve.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";
import type { Address, Result, Rule } from "@/lib/types";
import AddressPageView from "../[id]/address-page";
import "../[id]/v3.css";
import { fontVars } from "../fonts";
import { viewProps } from "../view-props";

/*
  /a/at?q=<typed address>: the same one-view page for an address outside the 500 samples
  (e.g. 4801 E 3rd St, East LA, unincorporated). The resolver (Census) finds the legal
  jurisdictions; a sample address redirects to its own page; anything else that isn't an
  address in our 3 states goes to /where.

  PROVISIONAL, until the engine evaluates typed addresses: there is no property record, so every
  building fact is unknown. A rule with no building condition applies; a rule that tests a
  building fact is "unknown" with that fact named. This is the engine's three-valued result for
  all-unknown facts, without its precedence step (a state rule that yields to a local rule stays
  listed; here only when the city's own rules are in HomeRule).
*/

export const metadata: Metadata = { title: "Address" };

const FACT_WORDS: Record<string, string> = {
  built: "the year the building was built",
  units: "the number of units",
  use_class: "what the building is used for",
  subsidised: "whether the building is subsidised",
  owner_type: "who owns the building (a person or a company)",
  owner_occupied: "whether the owner lives in the building",
};

function provisional(rule: Rule): Result {
  const facts = rule.coverage_facts;
  const base = { rule_id: rule.rule_id, category: rule.category, confidence: 0.5, what_next: rule.what_next };
  if (rule.status === "pending") return { ...base, result: "pending", explanation: `${rule.citation} is a bill, not law.` };
  if (rule.status === "not_yet_effective") return { ...base, result: "not_yet_effective", explanation: `${rule.citation} is not in force yet.` };
  if (!facts.length) return { ...base, result: "applies", explanation: `Statewide rule in force (${rule.citation}); it has no building condition.` };
  return {
    ...base,
    result: "unknown",
    missing_facts: facts.map((f) => FACT_WORDS[f] ?? f),
    explanation: `Unknown whether ${rule.citation} covers this address: it depends on ${facts.map((f) => FACT_WORDS[f] ?? f).join(", ")}, and we have no property record for a typed address.`,
  };
}

export default async function TypedAddressPage(props: PageProps<"/a/at">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  if (!q) redirect("/");

  const r = await resolveQuery(q, { fetch, samples: sampleIndex() });
  if (r.kind !== "address" || r.coverage === "not_covered") redirect(`/where?q=${encodeURIComponent(q)}`);
  if (r.sample) redirect(`/a/${r.sample.address_id}`);

  const id = (lvl: string) => r.tree.find((l) => l.level === lvl)?.id ?? null;
  const state = id("state");
  if (!state) redirect(`/where?q=${encodeURIComponent(q)}`);
  const local = r.tree.findLast((l) => l.level === "municipality" || l.level === "unincorporated");
  const city = local?.level === "municipality" && local.status === "covered" ? local.id : null;
  const [street, postal] = r.matched_address.split(",").map((s) => s.trim());
  const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

  const address: Address = {
    address_id: "typed",
    street: title(street ?? q),
    postal_city: title(postal ?? ""),
    state_code: state,
    zip: null,
    jurisdictions: { state, county: id("county") ?? "", city: city ?? "" },
    facts: { built: null, units: null, use_class: null, subsidised: null, owner_type: null, owner_occupied: null },
    fact_sources: {},
    coords: r.coords,
    source: { dataset: "US Census geocoder", retrieved_at: r.as_of, use_description: "" },
  };
  const stack = new Set([state, city].filter(Boolean));
  const results = data.rules.filter((x) => stack.has(x.jurisdiction_id)).map(provisional);

  // A level whose law exists but isn't in HomeRule (e.g. LA County's own rules for unincorporated areas): say so.
  const gap = r.tree.find((l) => l.level !== "federal" && l.status === "not_covered" && l.note);
  const vp = viewProps(data, address, results, { typed: true, legalNote: [r.notes[0], gap?.note].filter(Boolean).join(" ") });
  if (gap) {
    for (const t of vp.view.tiles)
      if (t.id === "rent" || t.id === "evict") t.notes.unshift({ kind: "flag", text: `${gap.name} has its own rules here, not in HomeRule` });
  }
  return (
    <div className={fontVars}>
      <AddressPageView {...vp} />
    </div>
  );
}
