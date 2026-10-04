// The read-only MCP tools as plain functions over the existing data and resolver: no new legal logic.
// find_place, get_address, get_changes, get_rule, get_jurisdiction, coverage (+ get_rules, kept for
// compatibility). Each website-parity tool builds from the same function its page renders.
// web/app/api/mcp/route.ts wraps them for MCP; node --test calls them directly (pure: relative imports, no server-only).
import { addressPageData, type AddressPageData } from "../address-page-data.ts";
import { addressPayload, AS_OF_RE, DISCLAIMER } from "../address-payload.ts";
import { glanceSummary, TILE_STATUS_WORDS, type TimelineEvent } from "../address-view.ts";
import { changesForPlace, entryInWindow } from "../changes/aggregate.ts";
import { changes } from "../changes/data.ts";
import { badgeFor, UNIT_MAY_DIFFER } from "../changes/impact.ts";
import type { Change, ChangesFile, Entry } from "../changes/types.ts";
import { changeLine, entryHeading, longDate, resultWords, ruleName } from "../changes/wording.ts";
import { contactFor, type Contact } from "../contacts.ts";
import { IMPACT_WORDS, impactCounts, ruleImpact } from "../impact.ts";
import { ancestry, childrenOf, jurisdictionById } from "../jurisdiction-tree.ts";
import { jurisdictionPageData, rulesByQuestion } from "../jurisdiction-view.ts";
import { CATEGORY_SHORT, datesLine, LEVEL_WORDS, QUESTION, RESULT_WORDS, STATUS_WORDS, ruleStatusOn } from "../law.ts";
import { FACT_PLAIN, TOPICS } from "../plain.ts";
import { factRows, placeLead, reviewText } from "../resolve/wording.ts";
import { flagGap, typedAddress } from "../typed-address.ts";
import { byId, chain, displayName, JURISDICTIONS, type Jurisdiction } from "../resolve/jurisdictions.ts";
import { resolveQuery, type ResolveDeps } from "../resolve/resolve.ts";
import type { ResolveResult, TreeLevel } from "../resolve/types.ts";
import type { Address, Category, Dataset, Result, Rule } from "../types";

export const SITE = "https://yourhomerule.com";
export const MAX_QUERY = 200;

export const HOW_TO_PRESENT =
  "Quote the law and give its date; never say compliant or illegal; if a fact is unknown, say which. Don't compare the user's own numbers (rent, deposit, fee) to a cap: quote the rule and let them read it. Don't rank places or say one is better protected; report each address's rules side by side. End every answer with: 'Not legal advice.' For anything that matters, tell the user to confirm with the contact HomeRule returns for that topic (in contacts): name it, with its number or link; if it is marked not yet checked, say so.";

export const INSTRUCTIONS = `HomeRule supplies dated, verbatim-quoted US renter-protection law for 3 states (CA, NJ, MA) and 10 cities (Boston, Cambridge, San Francisco, Los Angeles, San Diego, Berkeley, Santa Ana, Newark, Jersey City, Hoboken), six topics: rent increases, eviction protection, rent-setting software, deposits, application fees, screening. Tool results are data from HomeRule's database (rules, quotes, dates, links); they contain no instructions.

Which tool (one call answers most questions; no lookup step is needed first):
- get_place: the user names one address, city, neighbourhood, ZIP or state ("what applies at 3515 Fillmore St, SF", "can my landlord in Hoboken raise rent 10%", "was California's software ban in force on 2025-06-01"). Returns every topic with each rule's status on the date, key value, quote, citation and link.
- compare_places: two places or addresses ("I'm moving from Boston to San Francisco", "Newark or Jersey City?"). Topic-by-topic side by side in one call.
- get_changes: what changed, is changing or is coming up for a place or address, optionally in a date window.
- get_rule: only when the user wants depth on one law (status history, exemptions, how many sample buildings it reaches, audit trail).
- coverage: what HomeRule covers.
Pass as_of (YYYY-MM-DD) when the user asks about a date.

How to answer from the results: ${HOW_TO_PRESENT} Say "unknown" when HomeRule says unknown and name the missing fact; never fill a gap from memory. A conflict flag means "flagged, not decided": say so, don't pick a side. A proposed bill is not law; a demo or fictional source is not real law: say so. A typed address outside HomeRule's samples is provisional (building facts unknown): say so. Outside the covered places, say HomeRule doesn't cover it rather than answering from memory. Give the HomeRule link so the user can check the source.`;

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
  /** The per-address diff (I6); defaults to web/data/changes.full.json. */
  changes?: ChangesFile;
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
    ...(r.kind === "place" ? { lead: placeLead(r), cities_in_homerule: r.children } : {}),
    ...(r.kind === "address" && r.sample
      ? { building_fact_rows: factRows(r.sample).map(([fact, value, source]) => ({ fact, value, source })), building_fact_review: reviewText(r.sample.review, r.sample.facts) }
      : {}),
    next_step: sampleId
      ? `Call get_address with address_id "${sampleId}" (get_changes for what changed).`
      : r.kind === "address" && lvl?.id
        ? `Call get_address with query "${r.matched_address}" (provisional: building facts unknown), or get_jurisdiction with jurisdiction_id "${lvl.id}".`
        : lvl?.id
          ? `Call get_jurisdiction with jurisdiction_id "${lvl.id}" (get_changes for what changed). Building facts are unknown for this place, so rules that depend on them stay unknown.`
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
    example_addresses: data.meta.demo_address_ids.flatMap((id) => {
      const a = data.addresses.find((x) => x.address_id === id);
      return a ? [{ address_id: a.address_id, street: a.street, city: a.postal_city, link: `${SITE}/a/${a.address_id}` }] : [];
    }),
    how_answers_work: ["Quoted from the law", "Dated, always", "Honest when unsure"],
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

// ================ website parity: get_address, get_changes, get_rule, get_jurisdiction ================
// Each tool builds from the same function its page renders (lib/address-page-data.ts, lib/changes/*,
// lib/impact.ts, lib/jurisdiction-view.ts), then only reshapes it: no second computation.

/** Hard caps so an answer stays small enough for a chat context; truncated lists say so and give the page link. */
export const CAPS = { rulesPerPlace: 60, placeChanges: 25, addressIds: 10, entries: 20, demoAddresses: 10, findings: 15 } as const;

/** Clip long text at a word boundary with an ellipsis; quotes stay verbatim up to the cut. */
export const QUOTE_MAX = 450;
function clip(t: string | null | undefined, max: number): string | null {
  if (t == null) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()} …`;
}

const rulePage = (id: string) => `${SITE}/r/${encodeURIComponent(id)}`;
const httpOnly = (u: string | null | undefined) => (u && /^https?:\/\//.test(u) ? u : null);

function capped<T>(list: T[], max: number, link: string): { items: T[]; truncated?: { shown: number; total: number; see: string } } {
  return list.length > max ? { items: list.slice(0, max), truncated: { shown: max, total: list.length, see: link } } : { items: list };
}

function untilOf(rule: Rule): string | null {
  const u = (rule as Rule & { effective_until?: string | null }).effective_until;
  return u ?? null;
}

function contactOut(c: Contact | null) {
  if (!c) return null;
  return {
    name: c.name,
    phone: c.phone,
    url: c.url,
    what_for: c.whatFor,
    free: c.free,
    ...(c.eligibility ? { eligibility: c.eligibility } : {}),
    checked: false as const,
    ...(c.phone ? { check_note: NOT_CHECKED } : {}),
    source_url: c.sourceUrl,
    retrieved_at: c.retrievedAt,
  };
}

/** Requested date vs the engine's one computed date: answer for the engine date, say so. */
function asOfFor(data: Dataset, requested: string | undefined) {
  const asOf = data.meta.default_as_of;
  const note =
    requested && requested !== asOf
      ? `The engine computed address results for ${asOf} only; you asked for ${requested}. This answer is as of ${asOf}; say which date you are answering for.`
      : null;
  return { asOf, note };
}

const RENTER_IMPACT_NOTE =
  "renter_impact is the change log's badge (↑ adds / ↓ narrows renter protection / ? depends on a fact we don't have), computed by HomeRule's engine per address from the topic's protection level before vs after. A change without one has no verdict: don't infer one. " +
  UNIT_MAY_DIFFER;

/** The page's renter-impact badge for one diff change (lib/changes/impact.ts badgeFor), or null. */
function impactOut(c: Change) {
  const b = badgeFor(c);
  return b ? { arrow: b.arrow, verdict: b.text, ...(b.why ? { why: b.why } : {}) } : null;
}

// ---------------- get_address ----------------

function addressAnswer(data: Dataset, core: AddressPageData, address: Address, results: Result[], opts: { typed: boolean; provisional?: string; asOfNote: string | null; link: string }): ToolAnswer {
  const v = core.view;
  const rules = new Map(data.rules.map((r) => [r.rule_id, r]));
  const resultOf = new Map(results.map((r) => [r.rule_id, r]));
  const logRules = new Set(core.changeLog?.rules ?? []);
  const logLink = core.changeLog ? `${SITE}${core.changeLog.href}` : null;
  const topicTitle = (id: string) => TOPICS.find((t) => t.id === id)?.title ?? id;
  const ev = (e: TimelineEvent) => ({
    date: e.date,
    topic: topicTitle(e.topic),
    title: e.title,
    ...(e.body ? { detail: e.body } : {}),
    rule_id: e.ruleId,
    ...(e.badge ? { renter_impact: { arrow: e.badge.arrow, verdict: e.badge.text, ...(e.badge.why ? { why: e.badge.why } : {}) } } : {}),
    rule_page: rulePage(e.ruleId),
    ...(logLink && logRules.has(e.ruleId) ? { what_changed: `${logLink}#c-${encodeURIComponent(e.ruleId)}` } : {}),
  });

  const topics = v.tiles.map((t) => ({
    category: TOPICS.find((x) => x.id === t.id)?.cat ?? null,
    topic: t.title,
    question: t.q,
    status: t.status,
    status_label: TILE_STATUS_WORDS[t.status],
    answer: t.line,
    law_from: t.from,
    explanation: t.expl,
    notes: t.notes.map((n) => n.text),
    missing_facts: t.missing,
    conflict: t.flag ? { flagged: true, ...t.flag } : null,
    next_steps: t.next,
    contact: contactOut(t.contact),
    helpers: t.helpers,
    other_levels: t.lawNotes,
    rules: t.rules.map((row) => {
      const rule = rules.get(row.rule_id)!;
      const res = resultOf.get(row.rule_id);
      return {
        rule_id: row.rule_id,
        level: row.level,
        where: row.where,
        title: row.title,
        status: row.stWord,
        quote: row.quote,
        quote_is_verbatim: row.quote !== null,
        ...(row.quote === null ? { quote_note: "Quote pending extraction: the official text is not in HomeRule's sources yet." } : {}),
        ...(row.why ? { why: row.why } : {}),
        citation: row.citation,
        official_source: row.sourceUrl,
        effective_date: rule.effective_date,
        ...(untilOf(rule) ? { effective_until: untilOf(rule) } : {}),
        ...(rule.effective_dates_disputed?.length ? { effective_dates_disputed: rule.effective_dates_disputed } : {}),
        ...(res?.missing_facts?.length ? { missing_facts: res.missing_facts } : {}),
        ...(res?.conflict_with?.length ? { conflict_with: res.conflict_with, conflict_note: "Flagged for review, not decided." } : {}),
        ...(res?.governed_by ? { governed_by: res.governed_by } : {}),
        meta: row.meta,
        rule_page: rulePage(row.rule_id),
      };
    }),
  }));

  const payload = {
    ...envelope(data, v.asOf),
    ...(opts.asOfNote ? { as_of_note: opts.asOfNote } : {}),
    address: {
      address_id: opts.typed ? null : address.address_id,
      street: v.street,
      postal_city: v.postal,
      state: address.state_code,
      typed: opts.typed,
      ...(opts.provisional ? { provisional: opts.provisional } : {}),
    },
    jurisdiction: {
      crumb: core.hero.crumb,
      ids: address.jurisdictions,
      legal_city: core.cityName,
      postal_city: address.postal_city,
      where: core.hero.cap,
      ...(core.hero.capSub ? { legal_vs_postal: core.hero.capSub } : {}),
    },
    building_facts: { shown: core.hero.facts.map((f) => f.text), source: core.hero.factSrc, values: address.facts },
    at_a_glance: glanceSummary(v.tiles),
    topics,
    timeline: {
      next: v.next ? ev(v.next) : null,
      coming_up: v.future.map(ev),
      ...(v.future.length ? {} : { coming_up_note: `No change is scheduled for this address as of ${v.asOfText}.` }),
      recently_changed: v.past.map(ev),
      renter_impact: RENTER_IMPACT_NOTE,
    },
    proposed_bills: v.proposed.map((b) => ({ ...b, not_law: true as const, note: "A bill, not law. It changes nothing unless it passes." })),
    links: {
      page: opts.link,
      ...(logLink ? { change_log: logLink } : {}),
    },
  };

  const contacts = [...new Map(v.tiles.filter((t) => t.contact).map((t) => [t.contact!.name, t])).values()]
    .map((t) => `${t.contact!.name}${t.contact!.phone ? `, ${t.contact!.phone} (not yet checked by us)` : ""}, ${t.contact!.url}`)
    .join("; ");
  const summary = [
    `${v.street}, ${v.postal}, as of ${v.asOf}${opts.typed ? " (typed address, provisional: no property record, building facts unknown)" : ""}.`,
    core.hero.cap,
    core.hero.capSub ?? "",
    ...glanceSummary(v.tiles),
    ...v.tiles.map((t) => `${t.title}: ${TILE_STATUS_WORDS[t.status]}. ${t.line}`),
    v.future.length ? `Coming up: ${v.future.map((e) => `${e.dateText}, ${e.title}`).join("; ")}.` : "",
    v.proposed.length ? `${v.proposed.length} proposed bill(s), not law.` : "",
    contacts ? `To confirm before acting, ask: ${contacts}.` : "",
    "Not legal advice.",
  ]
    .filter(Boolean)
    .join(" ");
  return { summary, payload, log: { tool: "get_address", address_id: opts.typed ? "typed" : address.address_id, as_of: v.asOf } };
}

export async function getAddress(deps: ToolDeps, args: { address_id?: string; query?: string; as_of?: string }): Promise<ToolAnswer> {
  const { data } = deps;
  const log: Record<string, unknown> = { tool: "get_address", address_id: args.address_id ?? null, as_of: args.as_of ?? null };
  if (args.as_of && !AS_OF_RE.test(args.as_of)) return fail(data, "as_of must look like YYYY-MM-DD.", log);
  if (!args.address_id === !args.query) return fail(data, "Give exactly one of address_id (a HomeRule sample address) or query (a typed street address).", log);
  const { asOf, note } = asOfFor(data, args.as_of);

  let id = args.address_id?.trim().toUpperCase() ?? null;
  if (args.query) {
    const q = args.query.trim();
    if (!q || q.length > MAX_QUERY) return fail(data, `Type a street address of at most ${MAX_QUERY} characters.`, log);
    const r = await resolveQuery(q, { fetch: deps.resolve.fetch, samples: deps.resolve.samples, today: deps.resolve.today });
    if (r.kind === "address" && r.sample) id = r.sample.address_id;
    else {
      const t = r.kind === "address" ? typedAddress(r, data.rules, q) : null;
      if (!t || r.kind !== "address") {
        const lvl = r.kind === "address" || r.kind === "place" ? rulesLevel(r.tree) : null;
        const message =
          r.kind === "not_found" || r.kind === "unavailable" || r.kind === "ambiguous"
            ? r.message
            : r.kind === "place"
              ? `"${q}" is a place, not a street address.`
              : "HomeRule does not cover this address.";
        const payload = {
          ...envelope(data, asOf),
          kind: r.kind,
          message,
          ...(r.kind === "ambiguous" ? { candidates: r.candidates } : {}),
          next_step: lvl?.id ? `Call get_jurisdiction with jurisdiction_id "${lvl.id}".` : "HomeRule has no law for this place; say so rather than answering from memory.",
          link: `${SITE}/where?q=${encodeURIComponent(q)}`,
        };
        return { summary: `${message} Not legal advice.`, payload, error: r.kind === "unavailable", log: { ...log, kind: r.kind } };
      }
      const core = addressPageData(data, t.address, t.results, { typed: true, legalNote: t.legalNote });
      flagGap(core.view, t.gap);
      return addressAnswer(data, core, t.address, t.results, {
        typed: true,
        provisional:
          "Typed address outside HomeRule's 500 samples: no property record, so every building fact is unknown. A rule with no building condition applies; one that tests a building fact is unknown with that fact named. Not the engine's full evaluation (no precedence step).",
        asOfNote: note,
        link: `${SITE}/a/at?q=${encodeURIComponent(q)}`,
      });
    }
  }

  const address = data.addresses.find((a) => a.address_id === id);
  if (!address) return fail(data, `Unknown address id ${id}. Use find_place, or pass query with the street address.`, log);
  const results = data.lookups[asOf]?.[address.address_id] ?? [];
  const core = addressPageData(data, address, results);
  return addressAnswer(data, core, address, results, { typed: false, asOfNote: note, link: `${SITE}/a/${address.address_id}` });
}

// ---------------- get_changes ----------------

function changeOut(c: Change, addressId: string) {
  return {
    rule_id: c.team_rule_id,
    rule: ruleName(c),
    topic: CATEGORY_SHORT[c.category as Category] ?? c.category,
    change: changeLine(c),
    before: resultWords(c.before),
    after: resultWords(c.after),
    explanation: c.after?.explanation ?? c.before?.explanation ?? null,
    conflict_flag: !!c.after?.conflict_flag,
    ...(c.after?.conflict_flag ? { conflict_note: "Flagged: may conflict with another rule. Not decided." } : {}),
    quote: c.requirement_quote,
    quote_is_verbatim: c.requirement_quote !== null,
    citation: c.citation ?? "Citation not stated",
    in_effect_from: longDate(c.effective_from),
    official_source: httpOnly(c.source_url),
    renter_impact: impactOut(c),
    rule_page: rulePage(c.team_rule_id),
    link: `${SITE}/changes/${encodeURIComponent(addressId)}#c-${encodeURIComponent(c.team_rule_id)}`,
  };
}

function entryOut(e: Entry, addressId: string) {
  return {
    source: e.source,
    kind: e.kind === "ingest" ? "new document checked" : "date comparison",
    when: entryHeading(e),
    before_as_of: e.before_as_of,
    after_as_of: e.after_as_of,
    title: e.title,
    ...(e.demo_label ? { demo_label: `${e.demo_label}: built from a fictional test document, not real law.` } : {}),
    changes: e.changes.map((c) => changeOut(c, addressId)),
  };
}

export async function getChanges(
  deps: ToolDeps,
  input: { address_id?: string; jurisdiction_id?: string; query?: string; place?: string; from?: string; to?: string },
): Promise<ToolAnswer> {
  const { data } = deps;
  // `place` (any address, place or jurisdiction id) is the one argument a model needs; the ids stay for old callers.
  const placeId = input.place?.trim().toUpperCase();
  const args =
    input.place && !input.query && !input.address_id && !input.jurisdiction_id
      ? placeId && byId.has(placeId)
        ? { ...input, jurisdiction_id: placeId }
        : placeId && /^A\d{4}$/.test(placeId)
          ? { ...input, address_id: placeId }
          : { ...input, query: input.place }
      : input;
  const file = deps.changes ?? changes;
  const log: Record<string, unknown> = { tool: "get_changes", address_id: args.address_id ?? null, jurisdiction_id: args.jurisdiction_id ?? null };
  for (const d of [args.from, args.to]) if (d && !AS_OF_RE.test(d)) return fail(data, "from and to must look like YYYY-MM-DD.", log);
  if ([args.address_id, args.jurisdiction_id, args.query].filter(Boolean).length !== 1)
    return fail(data, "Give place (an address, city or state), or exactly one of address_id, jurisdiction_id or query.", log);
  const window = { from: args.from, to: args.to };
  const windowText = args.from || args.to ? ` between ${args.from ?? "the start"} and ${args.to ?? "now"}` : "";

  let addressId = args.address_id?.trim().toUpperCase() ?? null;
  let jid = args.jurisdiction_id?.trim().toUpperCase() ?? null;
  let note: string | null = null;
  if (args.query) {
    const q = args.query.trim();
    if (!q || q.length > MAX_QUERY) return fail(data, `Type an address or place of at most ${MAX_QUERY} characters.`, log);
    const r = await resolveQuery(q, { fetch: deps.resolve.fetch, samples: deps.resolve.samples, today: deps.resolve.today });
    if (r.kind === "address" && r.sample) addressId = r.sample.address_id;
    else if ((r.kind === "address" || r.kind === "place") && r.coverage !== "not_covered" && rulesLevel(r.tree)?.id) {
      jid = rulesLevel(r.tree)!.id!;
      if (r.kind === "address") note = `${r.matched_address} is not one of HomeRule's sample addresses, so it has no change log of its own; these are the changes across the sample addresses in the same ${jid.includes("-") ? "city" : "state"}.`;
    } else {
      const message = r.kind === "not_found" || r.kind === "unavailable" || r.kind === "ambiguous" ? r.message : "HomeRule does not cover this place.";
      return { summary: `${message} Not legal advice.`, payload: { ...envelope(data, file.as_of), kind: r.kind, message, link: `${SITE}/where?q=${encodeURIComponent(q)}` }, error: r.kind === "unavailable", log };
    }
  }

  if (addressId) {
    const address = data.addresses.find((a) => a.address_id === addressId);
    const rec = file.addresses[addressId];
    if (!address && !rec) return fail(data, `Unknown address id ${addressId}.`, log);
    const entries = (rec?.entries ?? []).filter((e) => entryInWindow(e, args.from, args.to));
    const list = capped(entries, CAPS.entries, `${SITE}/changes/${addressId}`);
    const label = rec?.label ?? (address ? `${address.street}, ${address.postal_city}` : addressId);
    const payload = {
      ...envelope(data, file.as_of),
      address_id: addressId,
      address: label,
      ...(note ? { note } : {}),
      window,
      entries: list.items.map((e) => entryOut(e, addressId!)),
      ...(list.truncated ? { truncated: list.truncated } : {}),
      ...(entries.length ? {} : { empty: `No change recorded for this address${windowText} between the dates HomeRule compares.` }),
      renter_impact: RENTER_IMPACT_NOTE,
      link: `${SITE}/changes/${encodeURIComponent(addressId)}`,
      address_page: `${SITE}/a/${encodeURIComponent(addressId)}`,
    };
    const lines = entries.flatMap((e) => e.changes.map((c) => `${ruleName(c)} (${c.citation ?? "no citation"}): ${changeLine(c)}${e.demo_label ? ` [${e.demo_label}, not real law]` : ""}`));
    const summary = `${label}: ${entries.length ? `${lines.length} change(s)${windowText}. ${entries.map((e) => `${entryHeading(e)}: ${e.title}.`).join(" ")} ${lines.slice(0, 8).join("; ")}.` : `no change recorded${windowText}.`} Not legal advice.`;
    return { summary, payload, log: { ...log, address_id: addressId } };
  }

  const j = jurisdictionById(jid!);
  if (!j) return fail(data, `Unknown jurisdiction_id ${jid}. Use find_place, or coverage() for the list.`, log);
  const agg = changesForPlace(file, j.id, window);
  const total = data.addresses.filter((a) => Object.values(a.jurisdictions).includes(j.id)).length;
  const list = capped(agg.rules, CAPS.placeChanges, `${SITE}/j/${j.id}`);
  /** Badge counts for one rule over its affected sample addresses (the per-address badges, counted; nothing new decided). */
  const badgeCounts = (ruleId: string, ids: string[]) => {
    const n: Record<string, number> = {};
    for (const id of ids)
      for (const e of file.addresses[id]?.entries ?? [])
        if (entryInWindow(e, args.from, args.to))
          for (const c of e.changes)
            if (c.team_rule_id === ruleId) {
              const b = impactOut(c);
              if (b) n[`${b.arrow} ${b.verdict}`] = (n[`${b.arrow} ${b.verdict}`] ?? 0) + 1;
            }
    return n;
  };
  const rulesOut = list.items.map((g) => ({
    rule_id: g.team_rule_id,
    renter_impact: badgeCounts(g.team_rule_id, g.address_ids),
    rule: g.title || g.citation || g.team_rule_id,
    topic: CATEGORY_SHORT[g.category as Category] ?? g.category,
    citation: g.citation ?? "Citation not stated",
    quote: g.requirement_quote,
    quote_is_verbatim: g.requirement_quote !== null,
    in_effect_from: longDate(g.effective_from),
    official_source: httpOnly(g.source_url),
    affected: g.affected,
    of_sample_addresses: total,
    transitions: g.transitions,
    sources: g.sources.map((s) => ({ id: s, title: file.sources[s]?.title ?? s, ...(file.sources[s]?.demo_label ? { demo_label: `${file.sources[s].demo_label}: fictional test document, not real law` } : {}) })),
    example_address_ids: g.address_ids.slice(0, CAPS.addressIds),
    ...(g.address_ids.length > CAPS.addressIds ? { more_addresses: g.address_ids.length - CAPS.addressIds } : {}),
    example_change_log: `${SITE}/changes/${encodeURIComponent(g.address_ids[0])}#c-${encodeURIComponent(g.team_rule_id)}`,
    rule_page: rulePage(g.team_rule_id),
  }));
  const payload = {
    ...envelope(data, file.as_of),
    jurisdiction: { id: j.id, name: j.legal_name.replace(/ city$/, ""), level: j.level },
    ...(note ? { note } : {}),
    window,
    sample_addresses: total,
    sample_addresses_with_changes: agg.sample_addresses,
    changes_by_rule: rulesOut,
    ...(list.truncated ? { truncated: list.truncated } : {}),
    ...(agg.rules.length ? {} : { empty: `No change recorded for sample addresses here${windowText}.` }),
    aggregate_note: "Counts over HomeRule's sample addresses here, not every building. Each address's own log is at /changes/<address_id>.",
    renter_impact: RENTER_IMPACT_NOTE,
    link: `${SITE}/j/${j.id}`,
  };
  const name = j.legal_name.replace(/ city$/, "");
  const summary = `${note ? `${note} ` : ""}${name}: ${agg.rules.length ? `${agg.rules.length} rule(s) changed for sample addresses here${windowText}. ${rulesOut.slice(0, 6).map((r) => `${r.rule} (${r.citation}, in effect from ${r.in_effect_from}): ${Object.entries(r.transitions).map(([t, n]) => `${t} at ${n} of ${total}`).join("; ")}${Object.keys(r.renter_impact).length ? ` (${Object.entries(r.renter_impact).map(([k, n]) => `${k}: ${n}`).join(", ")})` : ""}${r.sources.some((s) => "demo_label" in s) ? " [fictional test document, not real law]" : ""}`).join(". ")}.` : `no change recorded for sample addresses${windowText}.`} Not legal advice.`;
  return { summary, payload, log: { ...log, jurisdiction_id: j.id } };
}

// ---------------- get_rule ----------------

export function getRule(deps: ToolDeps, args: { rule_id: string; as_of?: string }): ToolAnswer {
  const { data } = deps;
  const log: Record<string, unknown> = { tool: "get_rule", rule_id: args.rule_id ?? null };
  if (args.as_of && !AS_OF_RE.test(args.as_of)) return fail(data, "as_of must look like YYYY-MM-DD.", log);
  const id = (args.rule_id ?? "").trim();
  const rule = data.rules.find((r) => r.rule_id === id) ?? data.rules.find((r) => r.rule_id.toUpperCase() === id.toUpperCase());
  if (!rule) return fail(data, `Unknown rule_id ${id}. Rule ids come from get_address, get_jurisdiction or get_changes.`, log);
  const asOf = args.as_of ?? data.meta.default_as_of;
  const chainJ = ancestry(rule.jurisdiction_id);
  const state = chainJ[0];
  const excerpt = data.excerpts[rule.rule_id];
  const impact = ruleImpact(data, rule, state.id);
  const st = ruleStatusOn(rule, asOf);
  const findings = (data.findings[rule.jurisdiction_id] ?? []).filter((f) => f.category === rule.category);
  const fList = capped(findings, CAPS.findings, rulePage(rule.rule_id));
  const titles = new Map(data.rules.map((r) => [r.rule_id, r.title]));

  const payload = {
    ...envelope(data, asOf),
    rule_id: rule.rule_id,
    title: rule.title,
    jurisdiction: chainJ.map((j) => ({ id: j.id, name: j.legal_name.replace(/ city$/, ""), link: `${SITE}/j/${j.id}` })),
    level: LEVEL_WORDS[rule.level],
    topic: CATEGORY_SHORT[rule.category],
    question: QUESTION[rule.category],
    ...(rule.fictional ? { fictional: "A rehearsal record, not law." } : {}),
    summary: rule.summary,
    quote: rule.quoted_span,
    quote_is_verbatim: rule.quoted_span !== null,
    ...(rule.quoted_span === null ? { quote_note: "Quote pending extraction: the official text of this rule is not in HomeRule's sources yet. Nothing is quoted until it is." } : {}),
    ...(excerpt ? { quote_context: { before: excerpt.before.slice(-300), after: excerpt.after.slice(0, 300) } } : {}),
    citation: rule.citation,
    official_source:
      rule.source_url && rule.source_kind === "official"
        ? { url: rule.source_url, kind: "official" }
        : rule.source_url
          ? { url: rule.source_url, kind: "secondary", note: "Not in HomeRule's sources. Only a secondary link (news or law-firm page)." }
          : { url: null, kind: "none", note: "Not in HomeRule's sources yet." },
    source_doc_id: rule.source_doc_id,
    retrieved_at: rule.retrieved_at,
    dates: datesLine(rule, asOf),
    effective_date: rule.effective_date,
    ...(untilOf(rule) ? { effective_until: untilOf(rule) } : {}),
    ...(rule.effective_dates_disputed?.length ? { effective_dates_disputed: rule.effective_dates_disputed } : {}),
    status_on_as_of: st ? STATUS_WORDS[st] : "Not on the books yet",
    status_history: (rule.status_history ?? []).map((h) => ({ from: h.from, status: STATUS_WORDS[h.status] })),
    covers: rule.coverage_in_words,
    ...(rule.coverage_facts.length ? { depends_on_building_facts: factWords(rule.coverage_facts) } : {}),
    key_value: rule.key_value,
    exemptions: rule.exemptions,
    other_levels: { type: rule.interaction.type, ...(rule.interaction.note ? { note: rule.interaction.note } : {}), ...(rule.interaction.quote ? { quote: rule.interaction.quote } : {}) },
    ...(rule.eviction ? { eviction: { ...rule.eviction, ...(rule.eviction_source ? { source: rule.eviction_source } : {}) } } : {}),
    open_question: rule.open_question ?? null,
    findings: fList.items,
    ...(fList.truncated ? { findings_truncated: fList.truncated } : {}),
    what_next: rule.what_next,
    audit: { extracted_by_model: rule.audit.model_extracted, decided_by_code: rule.audit.code_decided },
    impact: {
      scope: `All ${Object.keys(impact.classes[data.meta.default_as_of] ?? {}).length} sample addresses in ${state.legal_name}`,
      by_date: data.meta.as_of_dates.map((d) => ({
        date: d.date,
        label: d.label,
        counts: Object.fromEntries(impactCounts(impact.classes[d.date] ?? {}).map((c) => [IMPACT_WORDS[c.cls], c.count])),
        with_conflict_flag: impact.conflicts[d.date]?.length ?? 0,
      })),
      examples: impact.demo.slice(0, CAPS.demoAddresses).map((d) => {
        const r = d.results[data.meta.default_as_of];
        return {
          address_id: d.id,
          address: `${d.street}, ${d.city}`,
          result: r ? RESULT_WORDS[r.result] : "Not listed",
          ...(r ? { explanation: r.explanation } : {}),
          ...(r?.governed_by ? { governed_by: { rule_id: r.governed_by, title: titles.get(r.governed_by) ?? r.governed_by } } : {}),
          link: `${SITE}/a/${d.id}`,
        };
      }),
    },
    link: rulePage(rule.rule_id),
  };
  const counts = payload.impact.by_date.find((d) => d.date === data.meta.default_as_of)?.counts ?? {};
  const summary = `${rule.title} (${rule.citation}), ${LEVEL_WORDS[rule.level]}, ${chainJ.map((j) => j.legal_name.replace(/ city$/, "")).join(" › ")}. ${payload.dates}; on ${asOf}: ${payload.status_on_as_of}. ${rule.quoted_span ? `Quote: "${rule.quoted_span}"` : "Quote pending extraction."} Covers: ${rule.coverage_in_words}${rule.exemptions ? ` Exemptions: ${rule.exemptions}` : ""} Sample addresses on ${data.meta.default_as_of}: ${Object.entries(counts).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ") || "none listed"}. Not legal advice.`;
  return { summary, payload, log: { ...log, rule_id: rule.rule_id, as_of: asOf } };
}

// ---------------- get_jurisdiction ----------------

export function getJurisdiction(deps: ToolDeps, args: { jurisdiction_id: string; as_of?: string }): ToolAnswer {
  const { data } = deps;
  const log: Record<string, unknown> = { tool: "get_jurisdiction", jurisdiction_id: args.jurisdiction_id ?? null };
  if (args.as_of && !AS_OF_RE.test(args.as_of)) return fail(data, "as_of must look like YYYY-MM-DD.", log);
  const jid = (args.jurisdiction_id ?? "").trim().toUpperCase();
  const pd = jurisdictionPageData(data, jid);
  if (!pd) return fail(data, `Unknown jurisdiction_id ${jid}. Use find_place, or coverage() for the list.`, log);
  const asOf = args.as_of ?? data.meta.default_as_of;
  const { j, chain: chainJ, rules, children, inPlace, demo } = pd;
  const nm = (x: { legal_name: string }) => x.legal_name.replace(/ city$/, "");
  const link = `${SITE}/j/${j.id}`;
  let shown = 0;
  const questions = rulesByQuestion(rules, asOf).map(({ category, list }) => {
    const room = Math.max(0, CAPS.rulesPerPlace - shown);
    const items = list.slice(0, room);
    shown += items.length;
    return {
      category,
      topic: CATEGORY_SHORT[category],
      question: QUESTION[category],
      ...(list.length === 0 ? { none: "No rule at this level or above in our sources." } : {}),
      rules: items.map(({ r, st }) => ({
        rule_id: r.rule_id,
        title: r.title,
        level: LEVEL_WORDS[r.level],
        jurisdiction_id: r.jurisdiction_id,
        status: STATUS_WORDS[st],
        ...(r.kind === "no_rule" ? { no_rule_finding: true } : {}),
        ...(r.effective_date && st === "not_yet_effective" ? { from: r.effective_date } : {}),
        dates: datesLine(r, asOf),
        effective_date: r.effective_date,
        ...(untilOf(r) ? { effective_until: untilOf(r) } : {}),
        key_value: r.key_value,
        summary: clip(r.summary, 400),
        // The rule page's quote, clipped for size (the full text is on rule_page / get_rule); never reworded.
        quote: clip(r.quoted_span, QUOTE_MAX),
        ...(r.quoted_span && r.quoted_span.length > QUOTE_MAX ? { quote_clipped: true } : {}),
        ...(r.quoted_span ? {} : { quote_note: "Quote pending extraction" }),
        citation: r.citation,
        official_source: httpOnly(r.source_url),
        depends_on: clip(r.coverage_in_words, 300),
        ...(r.coverage_facts.length ? { unknown_without: factWords(r.coverage_facts) } : {}),
        ...(r.interaction?.note && r.interaction.type !== "none" ? { other_levels: clip(r.interaction.note, 250) } : {}),
        ...(r.fictional ? { fictional: "A rehearsal record, not law." } : {}),
        rule_page: rulePage(r.rule_id),
      })),
      ...(items.length < list.length ? { truncated: { shown: items.length, total: list.length, see: link } } : {}),
    };
  });
  const stackIds = new Set(j.level === "county" ? chainJ.filter((x) => x.level === "state").map((x) => x.id) : chainJ.map((x) => x.id));
  const findings = [...stackIds].flatMap((x) => (data.findings[x] ?? []).map((f) => ({ jurisdiction_id: x, topic: CATEGORY_SHORT[f.category as Category] ?? f.category, ...f })));
  const fList = capped(findings, CAPS.findings, link);
  const who = contactsFor(j.level === "city" ? j.id : null, chainJ[0].id, rules.map((r) => r.category));
  const cities = children.flatMap((c): { city: (typeof children)[number]; county: (typeof children)[number] | null }[] => (c.level === "county" ? childrenOf(c.id).map((city) => ({ city, county: c })) : [{ city: c, county: null }]));
  const payload = {
    ...envelope(data, asOf),
    jurisdiction: { id: j.id, name: nm(j), level: j.level, crumb: chainJ.map((x) => ({ id: x.id, name: nm(x), link: `${SITE}/j/${x.id}` })) },
    ...(j.level === "county" ? { note: "No county rules: city and state law apply. The corpus has no county housing law, and every sample address is inside a city." } : {}),
    ...(j.level === "state" ? { note: "State rules only; each city's own rules are on its page (cities below)." } : {}),
    building_facts: "unknown (no specific building). Rules with building conditions say what they depend on; for a decided result per building, use get_address.",
    questions,
    cities: cities.map(({ city, county }) => ({ id: city.id, name: nm(city), ...(county ? { county: county.legal_name } : {}), link: `${SITE}/j/${city.id}` })),
    sample_addresses: inPlace.length,
    example_addresses: demo.slice(0, CAPS.demoAddresses).map((a) => ({ address_id: a.address_id, street: a.street, link: `${SITE}/a/${a.address_id}` })),
    ...(demo.length > CAPS.demoAddresses ? { more_example_addresses: demo.length - CAPS.demoAddresses } : {}),
    contacts: who.contacts,
    findings: fList.items,
    ...(fList.truncated ? { findings_truncated: fList.truncated } : {}),
    link,
  };
  const counts = questions.map(
    (q) =>
      `${q.topic}: ${q.rules.length ? q.rules.map((r) => `${r.title} (${r.citation}; ${r.status}${r.status === STATUS_WORDS.in_force || r.dates === r.status ? "" : `; ${r.dates}`})${r.key_value ? `: ${r.key_value}` : ""}`).join("; ") : "no rule in HomeRule's sources"}`,
  );
  const summary = `${chainJ.map(nm).join(" › ")}, as of ${asOf}. ${counts.join(". ")}.${who.line ? ` ${who.line}` : ""} Not legal advice.`;
  return { summary, payload, log: { ...log, jurisdiction_id: j.id, as_of: asOf } };
}

// ================ task-shaped tools: get_place, compare_places ================
// One call per question. Both only route to the builders above (getAddress, getJurisdiction, findPlace):
// no second computation, so parity with the pages holds by construction.

/** Any address, place, ZIP or jurisdiction id → the address answer, the place's rules, or "not covered". */
export async function getPlace(deps: ToolDeps, args: { place: string; as_of?: string }): Promise<ToolAnswer> {
  const { data } = deps;
  const log = { tool: "get_place" };
  const p = (args.place ?? "").trim();
  if (!p) return fail(data, "Name an address, a city, a neighbourhood, a ZIP or a state.", log);
  if (p.length > MAX_QUERY) return fail(data, `The place is longer than ${MAX_QUERY} characters.`, log);
  if (args.as_of && !AS_OF_RE.test(args.as_of)) return fail(data, "as_of must look like YYYY-MM-DD.", log);
  const tag = (a: ToolAnswer, kind: string, extra: Record<string, unknown> = {}): ToolAnswer => ({
    ...a,
    payload: { ...a.payload, answer_kind: kind, asked: p, ...extra },
    log: { ...a.log, tool: "get_place", via: a.log.tool },
  });

  const id = p.toUpperCase();
  if (byId.has(id)) return tag(getJurisdiction(deps, { jurisdiction_id: id, as_of: args.as_of }), "place");
  if (/^A\d{4}$/.test(id) && data.addresses.some((a) => a.address_id === id)) return tag(await getAddress(deps, { address_id: id, as_of: args.as_of }), "address");

  const r = await resolveQuery(p, { fetch: deps.resolve.fetch, samples: deps.resolve.samples, today: deps.resolve.today });
  if (r.kind === "address" && r.coverage !== "not_covered") {
    return tag(await getAddress(deps, r.sample ? { address_id: r.sample.address_id, as_of: args.as_of } : { query: p, as_of: args.as_of }), "address");
  }
  const lvl = r.kind === "place" && r.coverage !== "not_covered" ? rulesLevel(r.tree) : null;
  if (r.kind === "place" && lvl?.id) {
    const j = getJurisdiction(deps, { jurisdiction_id: lvl.id, as_of: args.as_of });
    const lead = [placeLead(r), ...r.notes].filter(Boolean).join(" ");
    const here = r.tree.at(-1);
    const stateOnly = r.coverage === "state_only" && here && here.level !== "state" ? `HomeRule has no local law for ${here.name}; these are the ${lvl.name} state rules only.` : "";
    const pre = [lead, stateOnly].filter(Boolean).join(" ");
    return tag({ ...j, summary: pre ? `${pre} ${j.summary}` : j.summary }, "place", { matched: here?.name ?? null, coverage: r.coverage, ...(r.notes.length ? { notes: r.notes } : {}) });
  }
  // Not covered, ambiguous, not found: find_place's answer says so (and lists candidates when ambiguous).
  const f = await findPlace(deps, p);
  const covered = (f.payload.coverage as string | undefined) ?? null;
  return tag(f, covered === "not_covered" ? "not_covered" : String(f.payload.kind ?? "not_found"), {
    ...(covered === "not_covered" ? { not_covered: "HomeRule has no law for this place. Say so; don't answer from memory." } : {}),
  });
}

type BriefRule = { rule_id: string; title: string; citation: string; status: string; quote: string | null; rule_page: string; level?: string; dates?: string; key_value?: unknown; depends_on?: string | null; effective_date?: string | null };
type BriefTopic = { status?: string; answer?: string; missing_facts?: unknown[]; none?: string; rules: BriefRule[] };
type Brief = { name: string; link: string; kind: string; provisional?: string; topics: Map<string, BriefTopic> };
type AddrPayload = { topics: (BriefTopic & { category: string; status_label: string })[]; address: { street: string; postal_city: string; provisional?: string }; links: { page: string } };
type PlacePayload = { questions: { category: string; none?: string; rules: BriefRule[] }[]; jurisdiction: { name: string }; link: string };

/** One side of a comparison: per topic the page's own status line (address) or the rules with status and key value (place). */
function briefOf(a: ToolAnswer): Brief {
  const topics = new Map<string, BriefTopic>();
  if (a.payload.answer_kind === "address") {
    const p = a.payload as unknown as AddrPayload;
    for (const t of p.topics)
      topics.set(t.category, {
        status: t.status_label,
        answer: t.answer,
        ...(t.missing_facts?.length ? { missing_facts: t.missing_facts } : {}),
        rules: t.rules.map((r) => ({ rule_id: r.rule_id, title: r.title, citation: r.citation, status: r.status, quote: clip(r.quote, 250), effective_date: r.effective_date, rule_page: r.rule_page })),
      });
    return { name: `${p.address.street}, ${p.address.postal_city}`, link: p.links.page, kind: "address", ...(p.address.provisional ? { provisional: p.address.provisional } : {}), topics };
  }
  const p = a.payload as unknown as PlacePayload;
  for (const q of p.questions)
    topics.set(q.category, {
      rules: q.rules.map((r) => ({ rule_id: r.rule_id, title: r.title, level: r.level, citation: r.citation, status: r.status, dates: r.dates, key_value: r.key_value, quote: clip(r.quote, 250), depends_on: r.depends_on, rule_page: r.rule_page })),
      ...(q.none ? { none: q.none } : {}),
    });
  return { name: p.jurisdiction.name, link: p.link, kind: "place", topics };
}

/** Two places or addresses side by side, topic by topic, from the same answers get_place gives. No ranking. */
export async function comparePlaces(deps: ToolDeps, args: { a: string; b: string; as_of?: string }): Promise<ToolAnswer> {
  const { data } = deps;
  const log = { tool: "compare_places" };
  const [A, B] = await Promise.all([getPlace(deps, { place: args.a, as_of: args.as_of }), getPlace(deps, { place: args.b, as_of: args.as_of })]);
  const bad = [A, B].find((x) => x.error);
  if (bad) return { ...bad, log };
  const uncovered = [A, B].filter((x) => x.payload.answer_kind !== "address" && x.payload.answer_kind !== "place");
  const asOf = String(A.payload.as_of);
  if (uncovered.length) {
    const payload = { ...envelope(data, asOf), places: [A, B].map((x) => ({ asked: x.payload.asked, kind: x.payload.answer_kind, summary: x.summary, link: x.payload.link })), note: "HomeRule can only compare covered places." };
    return { summary: `${uncovered.map((x) => x.summary).join(" ")} Not legal advice.`, payload, log };
  }
  const [a, b] = [briefOf(A), briefOf(B)];
  const cats = Object.keys(CATEGORY_SHORT) as Category[];
  const side_by_side = cats.map((c) => ({ topic: CATEGORY_SHORT[c], question: QUESTION[c], [a.name]: a.topics.get(c) ?? null, [b.name]: b.topics.get(c) ?? null }));
  const line = (x: Brief, c: Category) => {
    const t = x.topics.get(c);
    if (!t) return "no rule in HomeRule's sources";
    if (x.kind === "address") return `${t.status}: ${t.answer}`;
    if (!t.rules.length) return "no rule in HomeRule's sources";
    return t.rules.map((r) => `${r.title} (${r.citation}; ${r.status})${r.key_value ? `: ${r.key_value}` : ""}`).join("; ");
  };
  const payload = {
    ...envelope(data, asOf),
    places: [a, b].map((x, i) => ({ asked: [args.a, args.b][i], name: x.name, kind: x.kind, link: x.link, ...(x.provisional ? { provisional: x.provisional } : {}) })),
    side_by_side,
    note: "Rules side by side, not a ranking. A city answer lists every rule at that level and above; which one governs a given building depends on its facts (pass an address for a decided answer).",
  };
  const summary = `${a.name} vs ${b.name}, as of ${asOf}. ${cats.map((c) => `${CATEGORY_SHORT[c]}: ${a.name}: ${line(a, c)}. ${b.name}: ${line(b, c)}.`).join(" ")} Not legal advice.`;
  return { summary, payload, log: { ...log, a: A.log, b: B.log } };
}
