// The three read-only MCP tools (find_place, get_rules, coverage) as plain functions over the
// existing data and resolver: no new legal logic. web/app/api/mcp/route.ts wraps them for MCP;
// node --test calls them directly (pure: relative imports, no server-only).
import { addressPayload, AS_OF_RE, DISCLAIMER } from "../address-payload.ts";
import { contactFor } from "../contacts.ts";
import { CATEGORY_SHORT, QUESTION, STATUS_WORDS, ruleStatusOn } from "../law.ts";
import { FACT_PLAIN } from "../plain.ts";
import { byId, chain, displayName, JURISDICTIONS, type Jurisdiction } from "../resolve/jurisdictions.ts";
import { resolveQuery, type ResolveDeps } from "../resolve/resolve.ts";
import type { ResolveResult, TreeLevel } from "../resolve/types.ts";
import type { Category, Dataset, Rule } from "../types";

export const SITE = "https://yourhomerule.com";
export const MAX_QUERY = 200;

export const HOW_TO_PRESENT =
  "Quote the law and give its date; never say compliant or illegal; if a fact is unknown, say which. Don't compare the user's own numbers (rent, deposit, fee) to a cap: quote the rule and let them read it. Don't rank places or say one is better protected; report each address's rules side by side. End every answer with: 'Not legal advice.' For anything that matters, tell the user to confirm with the contact HomeRule returns for that topic (in contacts): name it, with its number or link; if it is marked not yet checked, say so.";

export const INSTRUCTIONS = `HomeRule supplies dated, quoted US renter-protection law for 3 states (CA, NJ, MA) and 10 cities. Start with find_place for any address or place, then get_rules with the address_id (sample addresses) or jurisdiction_id it returns. ${HOW_TO_PRESENT} Say "unknown" when HomeRule says unknown; never fill a gap from memory. Give the HomeRule link so the user can check the source.`;

const NOT_CHECKED = "Number not yet checked by us, confirm before calling";

/** Who to ask per topic in the answer: the same contact the address page tiles show (contracts/contacts.json). */
function contactsFor(city: string | null, state: string, categories: Iterable<Category>) {
  const wanted = new Set(categories);
  const order = (Object.keys(CATEGORY_SHORT) as Category[]).filter((c) => wanted.has(c));
  const contacts = [];
  const missing: string[] = [];
  for (const category of order) {
    const c = contactFor(city, state, category);
    if (!c) {
      missing.push(CATEGORY_SHORT[category]);
      continue;
    }
    contacts.push({
      category,
      topic: CATEGORY_SHORT[category],
      name: c.name,
      phone: c.phone,
      url: c.url,
      what_for: c.whatFor,
      ...(c.eligibility ? { eligibility: c.eligibility } : {}),
      checked: false as const,
      ...(c.phone ? { check_note: NOT_CHECKED } : {}),
      source_url: c.sourceUrl,
    });
  }
  // One line per contact, topics grouped, so text-only clients still see who to ask.
  const byName = new Map<string, { c: (typeof contacts)[number]; topics: string[] }>();
  for (const c of contacts) {
    const g = byName.get(c.name) ?? { c, topics: [] };
    g.topics.push(c.topic.toLowerCase());
    byName.set(c.name, g);
  }
  const parts = [...byName.values()].map(({ c, topics }) => `${topics.join(", ")}: ${c.name}, ${c.phone ? `${c.phone} (not yet checked by us), ` : ""}${c.url}`);
  const line = `${parts.length ? `To confirm before acting, ask: ${parts.join("; ")}.` : ""}${missing.length ? ` HomeRule has no contact for: ${missing.join(", ").toLowerCase()}.` : ""}`.trim();
  return { contacts, line };
}

export type ToolDeps = {
  data: Dataset;
  resolve: Pick<ResolveDeps, "fetch" | "samples" | "today">;
};

/** A tool answer: a short plain summary plus the JSON payload. `error` marks a tool error (bad input, unknown id). */
export type ToolAnswer = { summary: string; payload: Record<string, unknown>; error?: boolean; log: Record<string, unknown> };

function envelope(data: Dataset, asOf: string) {
  return {
    not_legal_advice: true as const,
    disclaimer: DISCLAIMER,
    as_of: asOf,
    retrieved: { data: data.meta.retrieved_at, engine_dates: data.meta.as_of_dates.map((d) => d.date) },
    how_to_present: HOW_TO_PRESENT,
  };
}

function fail(data: Dataset, message: string, log: Record<string, unknown>): ToolAnswer {
  return { summary: message, payload: { ...envelope(data, data.meta.default_as_of), error: message }, error: true, log: { ...log, error: message } };
}

/** The deepest level HomeRule has rules for (city if covered, else state), the id get_rules takes. */
function rulesLevel(tree: TreeLevel[]): TreeLevel | null {
  return tree.findLast((l) => l.status === "covered" && l.id) ?? null;
}

// ---------------- find_place ----------------

export async function findPlace(deps: ToolDeps, query: string): Promise<ToolAnswer> {
  const q = query.trim();
  if (!q) return fail(deps.data, "Type an address, a city, a neighbourhood, a county or a state.", { tool: "find_place" });
  if (q.length > MAX_QUERY) return fail(deps.data, `The query is longer than ${MAX_QUERY} characters.`, { tool: "find_place" });

  const r: ResolveResult = await resolveQuery(q, { fetch: deps.resolve.fetch, samples: deps.resolve.samples, today: deps.resolve.today });
  const base = envelope(deps.data, deps.data.meta.default_as_of);
  const log = { tool: "find_place", kind: r.kind } as Record<string, unknown>;

  if (r.kind === "not_found" || r.kind === "unavailable" || r.kind === "ambiguous") {
    const payload = { ...base, resolved_on: r.as_of, kind: r.kind, message: r.message, ...(r.kind === "ambiguous" ? { candidates: r.candidates } : {}), ...(r.kind === "not_found" && r.suggestion ? { suggestion: r.suggestion } : {}), link: `${SITE}/where?q=${encodeURIComponent(q)}` };
    return { summary: r.message, payload, error: r.kind === "unavailable", log };
  }

  const lvl = rulesLevel(r.tree);
  const local = r.tree.findLast((l) => l.level === "municipality" || l.level === "unincorporated");
  const sampleId = r.kind === "address" ? r.sample?.address_id ?? null : null;
  const link = sampleId
    ? `${SITE}/a/${sampleId}`
    : r.kind === "address" && r.coverage !== "not_covered"
      ? `${SITE}/a/at?q=${encodeURIComponent(r.matched_address)}`
      : r.kind === "place" && r.coverage !== "not_covered" && lvl?.id
        ? `${SITE}/j/${lvl.id}`
        : `${SITE}/where?q=${encodeURIComponent(q)}`;
  log.address_id = sampleId;
  log.jurisdiction_id = lvl?.id ?? null;

  const payload = {
    ...base,
    resolved_on: r.as_of,
    kind: r.kind,
    ...(r.kind === "address" ? { matched_address: r.matched_address } : { matched: r.matched }),
    coverage: r.coverage,
    jurisdiction_tree: r.tree.map((l) => ({ level: l.level, label: l.label, name: l.name, id: l.id, status: l.status, ...(l.note ? { note: l.note } : {}) })),
    legal_city: local?.level === "municipality" ? local.name : null,
    postal_city: r.kind === "address" ? (r.matched_address.split(",")[1]?.trim() ?? null) : null,
    notes: r.notes,
    ...(r.kind === "address" && r.warnings.length ? { warnings: r.warnings } : {}),
    sample_address_id: sampleId,
    ...(sampleId && r.kind === "address" && r.sample ? { building_facts: r.sample.facts } : {}),
    rules_jurisdiction_id: lvl?.id ?? null,
    next_step: sampleId
      ? `Call get_rules with address_id "${sampleId}".`
      : lvl?.id
        ? `Call get_rules with jurisdiction_id "${lvl.id}". Building facts are unknown for this place, so rules that depend on them stay unknown.`
        : "HomeRule has no law for this place; say so rather than answering from memory.",
    link,
  };

  const where = r.kind === "address" ? r.matched_address : r.tree.map((l) => l.name).join(" › ");
  const cov =
    r.coverage === "covered"
      ? `HomeRule covers it (${lvl?.name} rules plus state rules).`
      : r.coverage === "state_only"
        ? `HomeRule covers only the ${r.tree.find((l) => l.level === "state")?.name} state rules here, not local law.`
        : "HomeRule does not cover this place.";
  const summary = [`${where}.`, cov, ...r.notes, sampleId ? `It is HomeRule sample address ${sampleId}.` : ""].filter(Boolean).join(" ");
  return { summary, payload, log };
}

// ---------------- get_rules ----------------

function factWords(facts: string[]): string[] {
  return facts.map((f) => FACT_PLAIN[f]?.name.toLowerCase() ?? f);
}

function ruleEntry(rule: Rule, asOf: string) {
  const status = ruleStatusOn(rule, asOf);
  return {
    rule_id: rule.rule_id,
    topic: CATEGORY_SHORT[rule.category],
    question: QUESTION[rule.category],
    level: rule.level,
    jurisdiction_id: rule.jurisdiction_id,
    title: rule.title,
    citation: rule.citation,
    status_on_as_of: status ?? "not_on_the_books",
    status_words: status ? STATUS_WORDS[status] : "Not on the books yet",
    effective_date: rule.effective_date,
    ...("effective_until" in rule && (rule as { effective_until?: string | null }).effective_until ? { effective_until: (rule as { effective_until?: string }).effective_until } : {}),
    ...(rule.effective_dates_disputed?.length ? { effective_dates_disputed: rule.effective_dates_disputed } : {}),
    status_history: rule.status_history ?? null,
    quote: rule.quoted_span,
    quote_is_verbatim: rule.quoted_span !== null,
    summary: rule.summary,
    key_value: rule.key_value,
    coverage_conditions: rule.coverage_in_words,
    ...(rule.coverage_facts.length
      ? { unknown_for_this_place: `Whether this rule covers a given building depends on: ${factWords(rule.coverage_facts).join(", ")}. HomeRule doesn't know these for a jurisdiction, so it stays unknown.` }
      : {}),
    exemptions: rule.exemptions,
    interaction: rule.interaction,
    ...(rule.open_question ? { open_question: rule.open_question } : {}),
    source_url: rule.source_url,
    source_kind: rule.source_kind,
    retrieved_at: rule.retrieved_at,
    rule_page: `${SITE}/r/${rule.rule_id}`,
  };
}

export function getRules(deps: ToolDeps, args: { address_id?: string; jurisdiction_id?: string; as_of?: string }): ToolAnswer {
  const { data } = deps;
  const log: Record<string, unknown> = { tool: "get_rules", address_id: args.address_id ?? null, jurisdiction_id: args.jurisdiction_id ?? null, as_of: args.as_of ?? null };
  if (args.as_of && !AS_OF_RE.test(args.as_of)) return fail(data, "as_of must look like YYYY-MM-DD.", log);
  if (!args.address_id === !args.jurisdiction_id) return fail(data, "Give exactly one of address_id (from find_place) or jurisdiction_id.", log);

  if (args.address_id) {
    const id = args.address_id.trim().toUpperCase();
    const { status, body } = addressPayload(data, id, args.as_of ?? null);
    if (status !== 200) return fail(data, String(body.error ?? "Unknown address id."), log);
    const asOf = String(body.as_of);
    const requested = args.as_of && args.as_of !== asOf ? args.as_of : null;
    const rules = new Map(data.rules.map((r) => [r.rule_id, r]));
    const results = (body.results as { rule_id: string; result: string; missing_facts?: string[] }[]).map((r) => {
      const rule = rules.get(r.rule_id);
      return requested && rule ? { ...r, rule_status_on_requested_date: ruleStatusOn(rule, requested) ?? "not_on_the_books" } : r;
    });
    const addr = body.address as { street: string; postal_city: string; jurisdictions: { state: string; city: string } };
    const who = contactsFor(
      addr.jurisdictions.city || null,
      addr.jurisdictions.state,
      results.flatMap((r) => (rules.get(r.rule_id) ? [rules.get(r.rule_id)!.category] : [])),
    );
    const payload = {
      ...envelope(data, asOf),
      ...body,
      results,
      contacts: who.contacts,
      ...(requested
        ? {
            as_of_note: `The engine computed address results for ${asOf} only; you asked for ${requested}. Results are as of ${asOf}; each result also carries the rule's status on ${requested} (rule_status_on_requested_date). Say which date you are answering for.`,
          }
        : {}),
      link: `${SITE}/a/${id}`,
      not_legal_advice: true,
    };
    const count = (v: string) => results.filter((r) => r.result === v).length;
    const unknown = results.filter((r) => r.result === "unknown");
    const summary = `${addr.street}, ${addr.postal_city}, as of ${asOf}: ${count("applies")} rules apply, ${unknown.length} unknown, ${count("superseded")} replaced by a stricter local rule, ${count("pending")} proposed (not law), ${count("not_yet_effective")} not yet in force.${unknown.length ? ` Unknown because HomeRule lacks: ${[...new Set(unknown.flatMap((r) => r.missing_facts ?? []))].join(", ") || "a fact named in the explanation"}.` : ""}${who.line ? ` ${who.line}` : ""} Not legal advice.`;
    return { summary, payload, log: { ...log, address_id: id, as_of: asOf } };
  }

  const jid = args.jurisdiction_id!.trim().toUpperCase();
  const j: Jurisdiction | undefined = byId.get(jid);
  if (!j) return fail(data, `Unknown jurisdiction_id ${jid}. Use find_place, or coverage() for the list.`, log);
  const asOf = args.as_of ?? data.meta.default_as_of;
  const stack = chain(j);
  const ids = new Set(stack.map((x) => x.id));
  const rules = data.rules
    .filter((r) => ids.has(r.jurisdiction_id) && !r.fictional)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "city" ? -1 : 1));
  const findings = stack.flatMap((x) =>
    (data.findings[x.id] ?? []).map((f) => ({ jurisdiction_id: x.id, topic: CATEGORY_SHORT[f.category as keyof typeof CATEGORY_SHORT] ?? f.category, ...f })),
  );
  const notCovered: string[] = [];
  if (j.level === "state") notCovered.push(`Local (city) rules are not included: a jurisdiction_id for ${displayName(j)} gives state rules only. Pass a city id or an address for local rules.`);
  if (j.level === "county") notCovered.push(`${displayName(j)} has no county rules in HomeRule; city and state law apply inside a city, and county law for unincorporated areas isn't in HomeRule.`);

  const entries = rules.map((r) => ruleEntry(r, asOf));
  const who = contactsFor(j.level === "city" ? j.id : null, stack[0].id, rules.map((r) => r.category));
  const payload = {
    ...envelope(data, asOf),
    jurisdiction: { id: j.id, name: displayName(j), level: j.level, stack: stack.map((x) => ({ id: x.id, name: displayName(x), level: x.level, has_rules: x.rules })) },
    building_facts: "unknown (no specific building). Rules with building conditions say which fact decides them.",
    precedence_note: "This lists every rule at each level; it does not decide which one governs a specific building (a stricter local rule can replace a state rule). For a decided result per building, use an address.",
    ...(notCovered.length ? { not_covered: notCovered } : {}),
    rules: entries,
    contacts: who.contacts,
    findings,
    link: `${SITE}/j/${j.id}`,
  };
  const inForce = entries.filter((e) => e.status_on_as_of === "in_force").length;
  const summary = `${stack.map((x) => displayName(x)).join(" › ")}, as of ${asOf}: ${entries.length} rules on record (${inForce} in force on that date; others pending, not yet in force or not on the books). ${entries.filter((e) => e.unknown_for_this_place).length} depend on building facts HomeRule doesn't have for a jurisdiction. ${findings.length} findings (open questions, state bars, laws without text in the sources).${who.line ? ` ${who.line}` : ""} Not legal advice.`;
  return { summary, payload, log: { ...log, jurisdiction_id: j.id, as_of: asOf } };
}

// ---------------- coverage ----------------

export function coverage(deps: ToolDeps): ToolAnswer {
  const { data } = deps;
  const states = JURISDICTIONS.filter((j) => j.level === "state");
  const cities = JURISDICTIONS.filter((j) => j.level === "city" && j.rules);
  const payload = {
    ...envelope(data, data.meta.default_as_of),
    states: states.map((s) => ({
      id: s.id,
      name: s.legal_name,
      cities: cities.filter((c) => chain(c)[0].id === s.id).map((c) => ({ id: c.id, name: displayName(c), link: `${SITE}/j/${c.id}` })),
    })),
    topics: Object.values(QUESTION),
    sample_addresses: data.addresses.length,
    not_covered: [
      "Any state other than California, New Jersey and Massachusetts.",
      "Cities and towns other than the 10 listed: only state rules apply to them in HomeRule.",
      "County ordinances (e.g. for unincorporated areas) and federal law.",
      "Building facts for addresses outside the 500 samples: rules that depend on them stay unknown.",
      "Topics other than the six listed (e.g. repairs, habitability, rent levels).",
    ],
    link: `${SITE}/where`,
  };
  const summary = `HomeRule covers ${states.length} states and ${cities.length} cities: ${states.map((s) => `${s.legal_name} (${cities.filter((c) => chain(c)[0].id === s.id).map(displayName).join(", ")})`).join("; ")}. Six topics: rent increases, eviction protection, deposits, application fees, screening, rent-setting software. Data as of ${data.meta.default_as_of}. Not legal advice.`;
  return { summary, payload, log: { tool: "coverage" } };
}
