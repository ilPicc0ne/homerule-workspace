import Link from "next/link";
import { withAsOf } from "@/lib/links";
import { confidenceWord, formatDate, formatRetrieved, percent } from "@/lib/format";
import { LEVEL_WORDS, QUESTION, RESULT_WORDS, STATUS_WORDS, ruleStatusOn, type Card } from "@/lib/law";
import type { Result, Rule } from "@/lib/types";
import { Dot, type DotKind } from "./status";

/*
  One renter question for one address on one date. Heading = the question, then the
  status in words, a one-line summary, the quote, citation, dates, confidence, level,
  and "What you can do next". Other rules in the same category follow as one-liners.
*/

type Props = {
  card: Card;
  rules: Record<string, Rule>;
  /** Rules in this address's jurisdictions and category, to explain an empty answer. */
  checked: Rule[];
  asOf: string;
  fallback: string;
  addressId: string;
};

export function ruleHref(ruleId: string, addressId: string | null, asOf: string, fallback: string) {
  return withAsOf(addressId ? `/r/${ruleId}?a=${addressId}` : `/r/${ruleId}`, asOf, fallback);
}

export function datesLine(rule: Rule, asOf: string): string {
  if (rule.effective_dates_disputed?.length) {
    return `Effective date disputed: ${rule.effective_dates_disputed.map((d) => formatDate(d.date)).join(" or ")}`;
  }
  const st = ruleStatusOn(rule, asOf);
  if (st === "pending") return "Proposed, not law";
  if (st === "failed") return "Failed, never became law";
  if (rule.effective_date) return `${st === "not_yet_effective" ? "Takes effect" : "In force since"} ${formatDate(rule.effective_date)}`;
  return st ? STATUS_WORDS[st] : "";
}

export function QuoteBlock({ rule }: { rule: Rule }) {
  if (rule.quoted_span) {
    return <blockquote className="quote">{rule.quoted_span}</blockquote>;
  }
  return (
    <p className="quote quote-pending">
      Quote pending extraction: the official text of this rule is not in our sources yet.
    </p>
  );
}

function statusText(card: Card, rules: Record<string, Rule>): { kind: DotKind; words: string } {
  if (card.status === "applies") return { kind: "applies", words: "Applies" };
  if (card.status === "unknown") return { kind: "unknown", words: "Unknown" };
  const lead = card.lead;
  if (lead && rules[lead.rule_id]?.kind === "no_rule") return { kind: "none", words: "None" };
  if (lead) return { kind: lead.result, words: "Nothing in force yet" };
  return { kind: "none", words: "None found" };
}

export default function QuestionCard({ card, rules, checked, asOf, fallback, addressId }: Props) {
  const lead = card.lead;
  const rule = lead ? rules[lead.rule_id] : null;
  const st = statusText(card, rules);
  const others = card.results.filter((r) => r !== lead);
  const conflicts = lead?.conflict_with?.map((id) => rules[id]).filter(Boolean) ?? [];

  let summary: string;
  let detail: string | null;
  if (!lead || !rule) {
    summary = "No rule in our sources covers this address for this question.";
    detail = null;
  } else if (lead.result === "unknown") {
    summary = lead.explanation;
    detail = `If it covers this building: ${rule.summary}`;
  } else if (lead.result === "not_yet_effective" || lead.result === "pending") {
    summary = "No rule in force on this date.";
    detail = `${RESULT_WORDS[lead.result]}: ${rule.summary}`;
  } else {
    summary = rule.summary;
    detail = lead.explanation;
  }

  return (
    <section className="q" id={`q-${card.category}`} aria-labelledby={`q-${card.category}-h`}>
      <div className="q-head">
        <h2 id={`q-${card.category}-h`}>{QUESTION[card.category]}</h2>
        {rule && <span className="tag">{LEVEL_WORDS[rule.level]}</span>}
      </div>

      <p className="q-status">
        <Dot kind={st.kind} />
        <span className={`word-${st.kind === "none" ? "none" : st.kind}`}>{st.words}</span>
        {rule && <span className="rule-name">{rule.title}</span>}
      </p>
      <p className="q-summary">{summary}</p>
      {detail && <p className="q-expl">{detail}</p>}

      {lead?.missing_facts?.length ? (
        <div className="missing">
          <strong>Missing fact:</strong> {lead.missing_facts.join("; ")}.
        </div>
      ) : null}

      {conflicts.length > 0 && (
        <div className="conflict">
          Possible conflict with{" "}
          {conflicts.map((c, i) => (
            <span key={c.rule_id}>
              {i > 0 && " and "}
              <Link href={ruleHref(c.rule_id, addressId, asOf, fallback)}>{c.title}</Link>
            </span>
          ))}
          . Flagged for human review, not decided.
        </div>
      )}

      {rule && <QuoteBlock rule={rule} />}

      {rule && lead && (
        <p className="meta-row">
          {rule.fictional ? <span>{rule.citation}</span> : <Link href={ruleHref(rule.rule_id, addressId, asOf, fallback)}>{rule.citation}</Link>}
          {rule.source_url && rule.source_kind === "official" && (
            <a href={rule.source_url} target="_blank" rel="noreferrer">
              Official source
            </a>
          )}
          <span>{datesLine(rule, asOf)}</span>
          {rule.retrieved_at && <span>Retrieved {formatRetrieved(rule.retrieved_at)}</span>}
          <span className="conf" title={`Confidence ${percent(lead.confidence)}`}>
            {confidenceWord(lead.confidence)} confidence
          </span>
        </p>
      )}

      {card.category === "just_cause_eviction" && rule?.eviction && (lead?.result === "applies" || lead?.result === "unknown") && (
        <dl className="evict">
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
            <dd>{rule.eviction.relocation}</dd>
          </div>
        </dl>
      )}

      {lead && (
        <p className="next">
          <span className="next-label">What you can do next</span>
          {lead.what_next.url ? (
            <a href={lead.what_next.url} target="_blank" rel="noreferrer">
              {lead.what_next.label}
            </a>
          ) : (
            <span>{lead.what_next.label}</span>
          )}
        </p>
      )}

      {others.length > 0 && (
        <ul className="others" aria-label="Other rules for this question">
          {others.map((o: Result) => {
            const r = rules[o.rule_id];
            return (
              <li key={o.rule_id}>
                <Dot kind={o.result} />
                <span>
                  <b className={`word-${o.result}`}>{RESULT_WORDS[o.result]}</b>{" "}
                  {r?.fictional ? (
                    <span>{r.title}</span>
                  ) : (
                    <Link href={ruleHref(o.rule_id, addressId, asOf, fallback)}>{r?.title ?? o.rule_id}</Link>
                  )}
                  {o.governed_by && rules[o.governed_by] ? ` (governed by ${rules[o.governed_by].title})` : ""}
                  {o.conflict_with?.length ? ", conflict flagged" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!lead && checked.length > 0 && (
        <div className="checked">
          <p className="muted small">Checked, and they don&rsquo;t cover this building:</p>
          {checked.map((r) => (
            <p key={r.rule_id}>
              <Link href={ruleHref(r.rule_id, addressId, asOf, fallback)}>{r.title}</Link>: {r.coverage_in_words}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
