// Builds web/data/live/*.json (the "Live" data source) from the engine and extraction outputs, in the
// shapes the pages already read (lib/types.ts). Called by sync-contracts.ts, so `npm run sync` keeps it
// current and tests/contracts-sync.test.ts fails when the committed copy drifts.
//
// Inputs (repo root): out/lookups.full.json (engine C), out/rules.json + out/rules.compiled.json (A),
// out/audit.json, out/addresses.resolved.json (B), and the pinned source texts the quotes come from
// (data/realpage-starter/corpus/text, data/supplemental-legal/text). Outside the full workspace (Vercel,
// public clone) the inputs are missing and the committed web/data/live/ is kept as is.
//
// Only short excerpts around each quote are published (excerpts.json), never whole source texts: the
// starter pack's licence is "TBD by organizers" and data/ is not in .publish-paths.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const LIVE_INPUTS = [
  "out/lookups.full.json",
  "out/rules.json",
  "out/rules.compiled.json",
  "out/audit.json",
  "out/addresses.resolved.json",
  "data/realpage-starter/corpus/corpus_manifest.csv",
  "data/supplemental-legal/manifest.json",
];

export const LIVE_DIR = "web/data/live";
export const LIVE_FILES = ["meta.json", "rules.json", "lookups.json", "addresses.json", "excerpts.json", "findings.json"];

/** Same featured addresses as the demo data, so the start page keeps its examples. */
const FEATURED = ["A0016", "A0081", "A0105", "A0107", "A0258", "A0256", "A0010", "A0005"];

const CONTEXT = 320;

const FACT_WORDS: Record<string, string> = {
  built: "the year the building was built",
  units: "the number of units",
  use_class: "what the building is used for",
  subsidised: "whether the building is subsidised",
  owner_type: "who owns the building (a person or a company)",
  owner_occupied: "whether the owner lives in the building",
};

const INTERACTION_NOTE: Record<string, string> = {
  yields_to_local: "Steps back where a stricter local rule covers the building.",
  may_preempt_local: "State law may limit local rules on this topic. HomeRule flags this for review and does not decide it.",
  may_be_preempted: "A state law may limit this local rule. HomeRule flags this for review and does not decide it.",
  coexists: "Applies alongside rules from other levels.",
};

function readJson(root: string, rel: string): J {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function parseCsv(text: string): J[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Facts named in a compiled predicate (applies_if / exempt_if). */
function factsIn(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => factsIn(n, out));
  const n = node as J;
  if (typeof n.fact === "string") out.add(n.fact);
  for (const v of Object.values(n)) if (typeof v === "object") factsIn(v, out);
}

function cutBefore(text: string): string {
  if (text.length < CONTEXT) return text;
  const s = text.slice(-CONTEXT);
  const sp = s.search(/\s/);
  return "…" + (sp >= 0 ? s.slice(sp) : s);
}

function cutAfter(text: string): string {
  if (text.length < CONTEXT) return text;
  const s = text.slice(0, CONTEXT);
  const sp = s.search(/\s\S*$/);
  return (sp > 0 ? s.slice(0, sp) : s) + "…";
}

type Source = { url: string | null; official: boolean; textPath: string | null };

function sources(root: string): Map<string, Source> {
  const out = new Map<string, Source>();
  const starter = parseCsv(readFileSync(join(root, "data/realpage-starter/corpus/corpus_manifest.csv"), "utf8"));
  for (const r of starter) {
    out.set(r.doc_id, {
      url: r.url || null,
      official: r.source_type === "official",
      textPath: r.text_file ? join("data/realpage-starter/corpus", r.text_file) : null,
    });
  }
  const supp = readJson(root, "data/supplemental-legal/manifest.json");
  for (const s of supp.sources as J[]) {
    // All supplemental sources are government documents (enactments, statutes, city guidance).
    out.set(s.source_id, {
      url: s.url ?? null,
      official: true,
      textPath: s.text_path ? join("data/supplemental-legal", s.text_path) : null,
    });
  }
  return out;
}

export function buildLive(root: string): Record<string, unknown> {
  const full = readJson(root, "out/lookups.full.json");
  const plain = new Map<string, J>((readJson(root, "out/rules.json").rules as J[]).map((r) => [r.team_rule_id, r]));
  const compiled = new Map<string, J>((readJson(root, "out/rules.compiled.json") as unknown as J[]).map((r) => [r.team_rule_id, r]));
  const audit = readJson(root, "out/audit.json");
  const resolved = readJson(root, "out/addresses.resolved.json").addresses as J[];
  const src = sources(root);
  const asOf: string = full.as_of;
  const findings: Record<string, J[]> = full.findings;

  // ---- rules ----
  const rules: J[] = [];
  const excerpts: Record<string, J> = {};
  for (const [id, fr] of Object.entries(full.rules as Record<string, J>).sort(([a], [b]) => a.localeCompare(b))) {
    const p = plain.get(id) ?? {};
    const c = compiled.get(id) ?? {};
    const a = audit[id] ?? {};
    const docId: string | null = fr.source_doc_id ?? null;
    const s = docId ? src.get(docId) : undefined;
    const from: string | null = fr.eff?.from ?? null;
    const until: string | null = fr.eff?.until ?? null;
    const quote: string | null = p.quoted_span ?? null;

    let status: string =
      fr.document_status === "pending" || c.status === "pending"
        ? "pending"
        : c.status === "enacted_not_effective"
          ? "not_yet_effective"
          : "in_force";
    if (status === "in_force" && from && from > asOf) status = "not_yet_effective";
    const history =
      status === "pending"
        ? [{ from: null, status: "pending" }]
        : from
          ? [
              { from: null, status: "not_yet_effective" },
              { from, status: "in_force" },
            ]
          : [{ from: null, status: "in_force" }];

    const covFacts = new Set<string>();
    factsIn(c.applies_if, covFacts);
    factsIn(c.exempt_if, covFacts);

    const inter = (c.interaction ?? { type: "none" }) as J;
    const interaction: J = { type: inter.type ?? "none" };
    if (INTERACTION_NOTE[interaction.type]) interaction.note = INTERACTION_NOTE[interaction.type];
    if (inter.quote) interaction.quote = inter.quote;

    const openQ = (findings[fr.jurisdiction_id] ?? []).find((f) => f.kind === "open_question" && f.category === fr.category);

    const official = !!(s?.official && (p.source_url ?? fr.source_url ?? s.url));
    const url: string | null = p.source_url ?? fr.source_url ?? s?.url ?? null;

    const steps: string[] = [
      `Jurisdiction: listed only for addresses whose state or legal city is ${fr.jurisdiction_id}.`,
      from
        ? `Dates: in force from ${from}${until ? ` until ${until}` : ""}${fr.eff?.derived ? ` (${fr.eff.derived})` : ""}; before that, not yet in force.`
        : status === "pending"
          ? "Dates: a bill, not law, so it never covers an address yet."
          : "Dates: no effective date in the text; treated as in force.",
      covFacts.size
        ? `Coverage: tested against ${[...covFacts].map((f) => FACT_WORDS[f] ?? f).join(", ")}; a missing fact gives "unknown", never a guess.`
        : "Coverage: no building condition the data can test; conditions in words stay with the text.",
    ];
    if (interaction.type === "yields_to_local") steps.push("Precedence: replaced where a stricter local rule covers the building; unknown when the local rule's coverage is unknown.");
    if (interaction.type === "may_preempt_local") steps.push("Conflict: flagged on both levels when a local rule on the same topic exists; never decided.");

    const model = (a.model ?? {}) as J;
    rules.push({
      rule_id: id,
      jurisdiction_id: fr.jurisdiction_id,
      schema_name: p.jurisdiction ?? null,
      level: c.level === "city" ? "city" : "state",
      kind: "rule",
      category: fr.category,
      title: p.title ?? fr.title ?? fr.citation ?? id,
      status,
      effective_date: from,
      status_history: history,
      citation: fr.citation ?? p.citation ?? id,
      source_doc_id: docId,
      source_url: url,
      source_kind: url ? (official ? "official" : "secondary") : "none",
      retrieved_at: fr.retrieved ?? null,
      quoted_span: quote,
      summary: p.requirement ?? model.requirement ?? "The text of this rule has not been summarised yet.",
      key_value: fr.key_value ?? null,
      coverage_in_words: p.coverage_conditions ?? "Conditions not extracted yet.",
      coverage_facts: [...covFacts].filter((f) => f in FACT_WORDS).sort(),
      exemptions: p.exemptions ?? null,
      interaction,
      ...(openQ ? { open_question: openQ.note } : {}),
      what_next: url
        ? { label: official ? "Read the law at its official source" : "Read the source we have (news or law-firm page)", url }
        : { label: "Ask your city's housing office about this rule" },
      audit: {
        model_extracted: {
          category: model.category ?? fr.category,
          requirement: model.requirement ?? null,
          key_value: model.key_value ?? null,
          effect: model.effect ?? c.x_source?.effect ?? null,
          quote_found_in_source: a.source?.quote_verbatim ?? quote !== null,
          confidence: typeof fr.confidence === "number" ? fr.confidence : 0,
        },
        code_decided: steps,
      },
    });

    // ---- excerpt: the quote in its pinned source text, with a little context ----
    if (quote && s?.textPath && existsSync(join(root, s.textPath))) {
      const text = readFileSync(join(root, s.textPath), "utf8");
      const at = text.indexOf(quote);
      if (at >= 0) {
        excerpts[id] = {
          doc_id: docId,
          offset: at,
          before: cutBefore(text.slice(0, at)),
          quote,
          after: cutAfter(text.slice(at + quote.length)),
        };
      }
    }
  }
  const ruleIds = new Set(rules.map((r) => r.rule_id));

  // ---- addresses (I3 → page shape) ----
  const datasetByCity = new Map<string, string>();
  const datasetOf = (r: J): string | null => {
    for (const k of ["built", "units"]) {
      const d: string | undefined = r.source_detail?.[k];
      if (d && d.includes(", ")) return d.split(", ").slice(1).join(", ");
    }
    return null;
  };
  for (const r of resolved) {
    const d = datasetOf(r);
    if (d && r.jurisdictions.city && !datasetByCity.has(r.jurisdictions.city)) datasetByCity.set(r.jurisdictions.city, d);
  }
  const addresses = resolved.map((r) => {
    const fact_sources: J = {};
    for (const k of Object.keys(r.facts)) {
      const detail = r.source_detail?.[k];
      if (detail) fact_sources[k] = { source: detail, confidence: r.confidence?.[k] ?? r.confidence?.jurisdiction ?? 0 };
    }
    const legal = r.legal_city as string | null;
    const out: J = {
      address_id: r.address_id,
      street: titleCase(r.input.street_address),
      postal_city: titleCase(r.input.postal_city),
      state_code: r.input.state,
      zip: r.input.zip ?? null,
      jurisdictions: r.jurisdictions,
      facts: r.facts,
      fact_sources,
      coords: r.coords ?? null,
      source: {
        dataset: datasetOf(r) ?? datasetByCity.get(r.jurisdictions.city) ?? "the challenge's sample data",
        retrieved_at: r.retrieved_at,
        use_description: r.source_detail?.use_class ?? "",
      },
      // In the live data every sample address has engine results and its own page.
      demo: true,
    };
    if (r.postal_differs && legal) {
      out.legal_city_note = `The mailing address says ${titleCase(r.input.postal_city)}, but the building is inside the City of ${legal}. ${legal} law applies.`;
    }
    if (r.review?.length) out.review_flag = r.review.join("; ");
    return out;
  });

  // ---- lookups (engine results → page shape), one date ----
  const byAddress: Record<string, J[]> = {};
  for (const [aid, a] of Object.entries(full.addresses as Record<string, J>).sort(([x], [y]) => x.localeCompare(y))) {
    byAddress[aid] = (a.results as J[])
      .filter((r) => ruleIds.has(r.team_rule_id))
      .map((r) => {
        const rule = rules.find((x) => x.rule_id === r.team_rule_id)!;
        const missing = (r.missing as string[]).filter((m) => !m.startsWith("unparsed")).map((m) => FACT_WORDS[m] ?? m);
        const out: J = {
          rule_id: r.team_rule_id,
          category: r.category,
          result: r.result,
          confidence: r.confidence ?? 0,
          explanation: r.explanation,
          what_next:
            r.result === "unknown" && missing.length
              ? { label: `Ask your landlord or the city's housing office about ${missing.join(" and ")}` }
              : rule.what_next,
        };
        if (r.governed_by) out.governed_by = r.governed_by;
        if (r.conflict_with?.length) out.conflict_with = r.conflict_with;
        if (missing.length) out.missing_facts = missing;
        return out;
      });
  }

  const meta = {
    data_source: "live",
    label: "Live",
    note: "Rules extracted from the challenge corpus and supplemental sources; results computed by the rule engine (make build). Quotes are verbatim.",
    default_as_of: asOf,
    retrieved_at: asOf,
    as_of_dates: [{ date: asOf, label: "Engine run" }],
    demo_address_ids: FEATURED,
  };

  return {
    "meta.json": meta,
    "rules.json": rules,
    "lookups.json": { [asOf]: byAddress },
    "addresses.json": addresses,
    "excerpts.json": excerpts,
    "findings.json": findings,
  };
}

export function liveInputsPresent(root: string): boolean {
  return LIVE_INPUTS.every((p) => existsSync(join(root, p)));
}

export function serialise(v: unknown): string {
  return JSON.stringify(v, null, 1) + "\n";
}
