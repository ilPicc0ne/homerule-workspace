import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import SourceTag from "@/components/source-tag";
import { DATA_SOURCE } from "@/lib/config";
import { datesLine } from "@/components/question-card";
import { ancestry, getDataset, jurisdictionById } from "@/lib/data";
import { formatDate, formatRetrieved, percent } from "@/lib/format";
import { PANELS, projectPanel } from "@/lib/geo";
import { conflictOn, impactClass, type ImpactClass } from "@/lib/impact";
import { CATEGORY_SHORT, LEVEL_WORDS, QUESTION, STATUS_WORDS } from "@/lib/law";
import type { Result } from "@/lib/types";
import Impact, { type ImpactPanel } from "./impact";

export function generateStaticParams() {
  return getDataset()?.rules.map((r) => ({ id: r.rule_id })) ?? [];
}

/** The route param can arrive percent-encoded ("NJ-ALG-56%3A9-23"): NJ rule ids contain ':', so decode before matching. */
function ruleId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata(props: PageProps<"/r/[id]">): Promise<Metadata> {
  const id = ruleId((await props.params).id);
  const r = getDataset()?.rules.find((x) => x.rule_id === id);
  return { title: r ? r.title : "Rule" };
}

const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  status: "Status",
  effective_date: "Effective date",
  key_value: "Key value",
  coverage: "Coverage",
  exemptions: "Exemptions",
  quote_found_in_source: "Quote found in source",
  confidence: "Confidence",
};

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (key === "confidence" && typeof v === "number") return percent(v);
  if (key === "category" && typeof v === "string" && v in CATEGORY_SHORT) return CATEGORY_SHORT[v as keyof typeof CATEGORY_SHORT];
  if (key === "status" && typeof v === "string" && v in STATUS_WORDS) return STATUS_WORDS[v as keyof typeof STATUS_WORDS];
  if (typeof v === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(v)) return formatDate(v);
  return String(v);
}

export default async function RulePage(props: PageProps<"/r/[id]">) {
  const id = ruleId((await props.params).id);
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  const rule = data.rules.find((r) => r.rule_id === id);
  if (!rule) notFound();

  const chain = ancestry(rule.jurisdiction_id);
  const state = chain[0];
  const excerpt = data.excerpts[rule.rule_id];
  const dates = data.meta.as_of_dates.map((d) => d.date);
  const titles = Object.fromEntries(data.rules.map((r) => [r.rule_id, r.title]));

  // Impact over every sample address in the rule's state, per date.
  const inState = data.addresses.filter((a) => a.jurisdictions.state === state.id);
  const classes: Record<string, Record<string, ImpactClass>> = {};
  const conflicts: Record<string, string[]> = {};
  for (const d of dates) {
    classes[d] = {};
    conflicts[d] = [];
    for (const a of inState) {
      classes[d][a.address_id] = impactClass(rule, a, d, data.lookups);
      if (conflictOn(rule, a, d, data.lookups, data.rules)) conflicts[d].push(a.address_id);
    }
  }
  const panels: ImpactPanel[] = PANELS.filter((p) => p.state === state.id).map((p) => {
    const f = projectPanel(p, data.addresses, 320);
    const demoIds = new Set(data.meta.demo_address_ids);
    return { id: p.id, label: p.label, width: f.width, height: f.height, points: f.points.map((pt) => ({ ...pt, demo: demoIds.has(pt.id) })) };
  });
  const noCoords = inState.filter((a) => !a.coords).length;

  const demo = data.meta.demo_address_ids
    .map((aid) => data.addresses.find((a) => a.address_id === aid)!)
    .filter((a) => a.jurisdictions.state === state.id)
    .map((a) => ({
      id: a.address_id,
      street: a.street,
      city: a.postal_city,
      results: Object.fromEntries(
        dates.map((d) => [d, (data.lookups[d]?.[a.address_id]?.find((x) => x.rule_id === rule.rule_id) ?? null) as Result | null]),
      ),
    }))
    .filter((d) => Object.values(d.results).some(Boolean));

  const extracted = rule.audit.model_extracted;
  const evSource = rule.eviction_source;

  return (
    <main className="wrap narrow" style={{ maxWidth: "52rem" }}>
      <div className="page-head">
        <ol className="crumbs" aria-label="Jurisdiction">
          {chain.map((j) => (
            <li key={j.id}>
              <Link href={`/j/${j.id}`}>{j.legal_name.replace(/ city$/, "")}</Link>
            </li>
          ))}
        </ol>
        <h1 style={{ marginTop: "0.75rem" }}>{rule.title}</h1>
        <p className="page-sub">
          {rule.citation}
          <span style={{ marginLeft: "0.75rem" }} className="tag">
            {LEVEL_WORDS[rule.level]}
          </span>{" "}
          <SourceTag />
        </p>
        <p className="q-summary" style={{ marginTop: "1rem" }}>
          {rule.summary}
        </p>
        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          Answers the question &ldquo;{QUESTION[rule.category]}&rdquo;
        </p>
      </div>

      <section className="section" aria-labelledby="source-h">
        <h2 id="source-h">The source</h2>
        {excerpt ? (
          <p className="excerpt">
            {excerpt.before}
            <mark>{excerpt.quote}</mark>
            {excerpt.after}
          </p>
        ) : (
          <p className="quote quote-pending">
            Quote pending extraction: the official text of this rule is not in our sources yet. Nothing is quoted until it
            is, and no wording is made up.
          </p>
        )}
        <dl className="kv">
          <div>
            <dt>Official law</dt>
            <dd>
              {rule.source_url && rule.source_kind === "official" ? (
                <a href={rule.source_url} target="_blank" rel="noreferrer">
                  Open the official source
                </a>
              ) : rule.source_url ? (
                <>
                  Not in our sources. Only a secondary link:{" "}
                  <a href={rule.source_url} target="_blank" rel="noreferrer">
                    news or law-firm page
                  </a>
                </>
              ) : (
                "Not in our sources yet"
              )}
            </dd>
          </div>
          {rule.source_doc_id && (
            <div>
              <dt>Document</dt>
              <dd>
                {rule.source_doc_id}
                {rule.retrieved_at && `, retrieved ${formatRetrieved(rule.retrieved_at)}`}
              </dd>
            </div>
          )}
          <div>
            <dt>Dates</dt>
            <dd>{datesLine(rule, data.meta.default_as_of)}</dd>
          </div>
          {rule.effective_dates_disputed && (
            <div>
              <dt>Published dates</dt>
              <dd>
                {rule.effective_dates_disputed.map((d) => (
                  <span key={d.date} style={{ display: "block" }}>
                    {formatDate(d.date)}: {d.source}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt>Status on {formatDate(data.meta.default_as_of)}</dt>
            <dd>{STATUS_WORDS[rule.status]}</dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="what-h">
        <h2 id="what-h">What it depends on</h2>
        <dl className="kv">
          <div>
            <dt>Covers</dt>
            <dd>{rule.coverage_in_words}</dd>
          </div>
          {rule.key_value && (
            <div>
              <dt>Key value</dt>
              <dd>{rule.key_value}</dd>
            </div>
          )}
          {rule.exemptions && (
            <div>
              <dt>Exemptions</dt>
              <dd>{rule.exemptions}</dd>
            </div>
          )}
          {rule.interaction.note && (
            <div>
              <dt>Other levels</dt>
              <dd>{rule.interaction.note}</dd>
            </div>
          )}
          {rule.eviction && (
            <>
              <div>
                <dt>Reasons</dt>
                <dd>{rule.eviction.reasons}</dd>
              </div>
              <div>
                <dt>Notice</dt>
                <dd>{rule.eviction.notice}</dd>
              </div>
              <div>
                <dt>Relocation money</dt>
                <dd>
                  {rule.eviction.relocation}
                  {evSource && (
                    <>
                      {" "}
                      <a href={evSource.url} target="_blank" rel="noreferrer">
                        Source ({evSource.doc_id})
                      </a>
                    </>
                  )}
                </dd>
              </div>
            </>
          )}
          {rule.open_question && (
            <div>
              <dt>Open question</dt>
              <dd>{rule.open_question}</dd>
            </div>
          )}
          <div>
            <dt>What you can do next</dt>
            <dd>
              {rule.what_next.url ? (
                <a href={rule.what_next.url} target="_blank" rel="noreferrer">
                  {rule.what_next.label}
                </a>
              ) : (
                rule.what_next.label
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="audit-h">
        <h2 id="audit-h">Audit trail</h2>
        <p className="section-sub">The model reads the law; code decides who it covers. The line between them stays visible.</p>
        <div className="audit">
          <div>
            <h3>Extracted by the model</h3>
            <p className="audit-sub">
              {DATA_SOURCE === "demo"
                ? "Demo data: hand-prepared in the shape the extraction will produce."
                : "What the model read from the source text, checked by code (the quote must appear word for word)."}
            </p>
            <dl className="kv">
              {Object.entries(extracted).map(([k, v]) => (
                <div key={k}>
                  <dt>{FIELD_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ")}</dt>
                  <dd>{show(k, v)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="boundary" aria-label="Reasoning boundary">
            reasoning boundary
          </p>
          <div>
            <h3>Decided by code</h3>
            <p className="audit-sub">Deterministic: same rules, facts and date give the same answer.</p>
            <ol className="steps">
              {rule.audit.code_decided.map((s) => (
                <li key={s}>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {rule.interaction.quote && (
              <blockquote className="quote">{rule.interaction.quote}</blockquote>
            )}
          </div>
        </div>
      </section>

      <Impact
        ruleId={rule.rule_id}
        stops={data.meta.as_of_dates}
        fallback={data.meta.default_as_of}
        retrieved={data.meta.retrieved_at}
        stateName={jurisdictionById(state.id)?.legal_name ?? state.id}
        panels={panels}
        classes={classes}
        conflicts={conflicts}
        noCoords={noCoords}
        demo={demo}
        ruleTitles={titles}
      />
    </main>
  );
}
