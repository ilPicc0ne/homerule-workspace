"use client";

import Link from "next/link";
import AsOfTimeline from "@/components/as-of-timeline";
import { ruleHref } from "@/components/question-card";
import { Dot } from "@/components/status";
import SourceTag from "@/components/source-tag";
import { DATA_SOURCE } from "@/lib/config";
import { useAsOf, useUrlParam } from "@/lib/as-of";
import { formatDate } from "@/lib/format";
import { IMPACT_ORDER, IMPACT_WORDS, type ImpactClass } from "@/lib/impact";
import { RESULT_WORDS } from "@/lib/law";
import type { Result } from "@/lib/types";

/*
  The advocate's view: which sample buildings does this rule reach on a date?
  All classes are precomputed per date on the server; the timeline only switches them.
*/

export type ImpactPanel = {
  id: string;
  label: string;
  width: number;
  height: number;
  points: { id: string; x: number; y: number; demo: boolean }[];
};

type Props = {
  ruleId: string;
  stops: { date: string; label: string }[];
  fallback: string;
  retrieved: string;
  stateName: string;
  panels: ImpactPanel[];
  /** date → address id → class; addresses of the rule's state only */
  classes: Record<string, Record<string, ImpactClass>>;
  conflicts: Record<string, string[]>;
  noCoords: number;
  demo: { id: string; street: string; city: string; results: Record<string, Result | null> }[];
  ruleTitles: Record<string, string>;
};

const FILL: Record<ImpactClass, { fill: string; stroke: string; dash?: string; r: number }> = {
  applies: { fill: "var(--teal)", stroke: "none", r: 3.4 },
  unknown: { fill: "var(--amber)", stroke: "none", r: 3.4 },
  superseded: { fill: "var(--slate)", stroke: "none", r: 3 },
  not_yet_effective: { fill: "#fff", stroke: "var(--teal)", r: 3.2 },
  pending: { fill: "#fff", stroke: "var(--slate)", dash: "1.6 1.4", r: 3.2 },
  area: { fill: "#fff", stroke: "var(--slate)", r: 3 },
  none: { fill: "var(--line-strong)", stroke: "none", r: 2 },
};

export default function Impact({ ruleId, stops, fallback, retrieved, stateName, panels, classes, conflicts, noCoords, demo, ruleTitles }: Props) {
  const asOf = useAsOf(
    stops.map((s) => s.date),
    fallback,
  );
  const from = useUrlParam("a");
  const cls = classes[asOf] ?? {};
  const conflictSet = new Set(conflicts[asOf] ?? []);

  const counts = new Map<ImpactClass, number>();
  for (const c of Object.values(cls)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const total = Object.keys(cls).length;

  return (
    <>
      <AsOfTimeline stops={stops} fallback={fallback} retrieved={retrieved} />

      <section className="section" aria-labelledby="impact-h">
        <h2 id="impact-h">
          Which buildings it reaches <SourceTag />
        </h2>
        <p className="section-sub">
          All {total} sample addresses in {stateName} on {formatDate(asOf)}.
        </p>
        <ul className="legend" aria-label="Counts">
          {IMPACT_ORDER.filter((c) => counts.get(c)).map((c) => (
            <li key={c}>
              <Dot kind={c} />
              <b>{counts.get(c)}</b> {IMPACT_WORDS[c].toLowerCase()}
            </li>
          ))}
          {conflictSet.size > 0 && (
            <li>
              <span className="dot" style={{ border: "1.5px dashed var(--ink)" }} aria-hidden="true" />
              <b>{conflictSet.size}</b> with a conflict flag
            </li>
          )}
        </ul>

        <div className="panels">
          {panels.map((p) => (
            <figure key={p.id} className="panel">
              <figcaption>{p.label}</figcaption>
              <div className="panel-frame">
                <svg className="map" viewBox={`0 0 ${p.width} ${p.height}`} role="img" aria-label={`Dot map of sample addresses in ${p.label}`}>
                  {p.points.map((pt) => {
                    const c = cls[pt.id] ?? "none";
                    const f = FILL[c];
                    return (
                      <g key={pt.id}>
                        {conflictSet.has(pt.id) && (
                          <circle cx={pt.x} cy={pt.y} r={f.r + 3} fill="none" stroke="var(--ink)" strokeWidth="0.8" strokeDasharray="1.5 1.2" />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={pt.demo ? f.r + 1.6 : f.r}
                          fill={f.fill}
                          stroke={pt.demo && f.stroke === "none" ? "var(--ink)" : f.stroke}
                          strokeWidth={pt.demo ? 1.2 : 1.1}
                          strokeDasharray={f.dash}
                        >
                          <title>{`${pt.id}: ${IMPACT_WORDS[c]}`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </figure>
          ))}
        </div>
        <p className="map-caption">
          {DATA_SOURCE === "demo"
            ? "Demo colouring: the larger dots are the hand-prepared demo addresses. Other dots use only jurisdiction and dates; where a rule depends on building facts they show “in the area, coverage not checked”."
            : "Every dot is the rule engine’s result for that address. The larger dots are the example addresses listed below."}
          {noCoords > 0 && ` ${noCoords} addresses have no coordinates and are counted but not drawn.`}
        </p>
      </section>

      {demo.length > 0 && (
        <section className="section" aria-labelledby="touch-h">
          <h2 id="touch-h">Decided by code for the example addresses</h2>
          <p className="section-sub">On {formatDate(asOf)}. Rules that don&rsquo;t apply are left out.</p>
          <ul className="touches">
            {demo.map((d) => {
              const r = d.results[asOf];
              return (
                <li key={d.id} style={from === d.id ? { background: "var(--teal-wash)", borderRadius: 10, padding: "0.4rem 0.6rem" } : undefined}>
                  <Dot kind={r ? r.result : "none"} />
                  <span>
                    <Link href={`/a/${d.id}${asOf === fallback ? "" : `?as_of=${asOf}`}`}>{d.street}</Link>, {d.city}:{" "}
                    <b className={r ? `word-${r.result}` : "muted"}>{r ? RESULT_WORDS[r.result] : "Not listed"}</b>
                    {r ? `. ${r.explanation}` : ""}
                    {r?.governed_by && (
                      <>
                        {" "}
                        Governed by <Link href={ruleHref(r.governed_by, d.id, asOf, fallback)}>{ruleTitles[r.governed_by] ?? r.governed_by}</Link>.
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {from && !demo.some((d) => d.id === from) && <p className="muted small">{ruleId} is not listed for {from}.</p>}
        </section>
      )}
    </>
  );
}
