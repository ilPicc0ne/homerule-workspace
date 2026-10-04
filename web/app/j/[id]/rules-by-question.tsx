"use client";

import Link from "next/link";
import AsOfTimeline from "@/components/as-of-timeline";
import { Dot, type DotKind } from "@/components/status";
import { useAsOf, useUrlParam } from "@/lib/as-of";
import { formatDate } from "@/lib/format";
import { withAsOf } from "@/lib/links";
import { rulesByQuestion } from "@/lib/jurisdiction-view.ts";
import { LEVEL_WORDS, QUESTION, STATUS_WORDS } from "@/lib/law";
import type { Rule, RuleStatus } from "@/lib/types";

/* The six questions at one level: rules from this level and above, with what they depend on. */

const STATUS_DOT: Record<RuleStatus, DotKind> = {
  in_force: "applies",
  not_yet_effective: "not_yet_effective",
  pending: "pending",
  failed: "none",
  effective_date_disputed: "unknown",
};

export default function RulesByQuestion({
  rules,
  stops,
  fallback,
  retrieved,
  placeName,
}: {
  rules: Rule[];
  stops: { date: string; label: string }[];
  fallback: string;
  retrieved: string;
  placeName: string;
}) {
  const asOf = useAsOf(
    stops.map((s) => s.date),
    fallback,
  );
  const via = useUrlParam("via");

  return (
    <>
      {via && (
        <p className="note" style={{ marginBottom: "1rem" }}>
          {via} is part of {placeName}, so {placeName} law applies there.
        </p>
      )}
      <AsOfTimeline stops={stops} fallback={fallback} retrieved={retrieved} />
      <div className="questions">
        {rulesByQuestion(rules, asOf).map(({ category: c, list }) => {
          return (
            <section key={c} className="q" aria-labelledby={`jq-${c}`}>
              <h2 id={`jq-${c}`}>{QUESTION[c]}</h2>
              {list.length === 0 ? (
                <p className="q-expl">No rule at this level or above in our sources.</p>
              ) : (
                <ul className="rule-list">
                  {list.map(({ r, st }) => (
                    <li key={r.rule_id} className="rule-item">
                      <span className="rule-item-title">
                        <Dot kind={r.kind === "no_rule" ? "none" : STATUS_DOT[st]} />
                        <Link href={withAsOf(`/r/${r.rule_id}`, asOf, fallback)}>{r.title}</Link>
                        <span className="tag">{LEVEL_WORDS[r.level]}</span>
                      </span>
                      <span className="muted small">
                        {STATUS_WORDS[st]}
                        {r.effective_date && st === "not_yet_effective" ? `, from ${formatDate(r.effective_date)}` : ""}
                        {r.quoted_span ? "" : ". Quote pending extraction"}
                      </span>
                      <span className="depends">
                        <b>Depends on: </b>
                        {r.coverage_in_words}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
