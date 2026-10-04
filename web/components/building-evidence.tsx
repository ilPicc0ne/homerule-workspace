"use client";
import { useState } from "react";
import type { EvidenceLead, EvidenceQuestion, EvidenceView } from "../lib/building-evidence-types";
import { evidenceValue, FACT_NAMES, safeEvidenceUrl, SOURCE_NAMES } from "../lib/evidence-display";
import { TOPICS } from "../lib/plain";
import styles from "./building-evidence.module.css";

function SourceLink({ url, children }: { url: string | null | undefined; children: React.ReactNode }) {
  const safe = safeEvidenceUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span>{children}</span>;
}
function Lead({ lead: l }: { lead: EvidenceLead }) {
  const difference = l.comparison === "review_difference";
  const candidate = !["exact_address", "normalized_address"].includes(l.match);
  return <article className={styles.record}>
    <p className={styles.recordTitle}>{FACT_NAMES[l.fact] ?? l.fact.replaceAll("_", " ")}: <strong>{l.meaning === "tax_exemption_proxy" ? "Tax exemption recorded" : evidenceValue(l.value)}</strong></p>
    <p className={styles.label}>{candidate ? "Possible match · needs confirmation" : "Address matched · building scope needs review"}{difference ? " · Differs from current data" : ""}</p>
    {difference && <p>Current building data: {evidenceValue(l.current_value)}. Both values are kept for review.</p>}
    <p>{l.limitation}</p>
    <p className={styles.meta}><SourceLink url={l.source_url}>{SOURCE_NAMES[l.source_id] ?? l.source_id}</SourceLink> · Record {l.source_record_id}<br />Source period: {l.source_period ?? "not stated"} · Retrieved {l.retrieved_at.slice(0, 10)}</p>
  </article>;
}
function Question({ q, first }: { q: EvidenceQuestion; first: boolean }) {
  const [copied, setCopied] = useState(false);
  return <article className={styles.question}>
    <h3>{first ? "The next useful question" : "Another useful question"}</h3>
    <p><strong>{q.question}</strong></p><p>{q.how_to_check}</p>
    <p className={styles.topics}>Could clarify: {q.topics.map((cat, i) => { const t = TOPICS.find(t => t.cat === cat); return <span key={cat}>{i > 0 && " · "}<a href={`#t-${t?.id ?? "rent"}`}>{t?.title ?? cat.replaceAll("_", " ")}</a></span>; })}</p>
    {q.public_record_routes.map(r => <p key={r.url}><SourceLink url={r.url}>{r.name}</SourceLink>. {r.method} <span className={styles.meta}>{r.limitation}</span></p>)}
    <details><summary>Request wording</summary><p className={styles.request}>{q.request_text}</p><button className={styles.button} type="button" onClick={async () => { try { await navigator.clipboard.writeText(q.request_text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy request"}</button><span role="status" className={styles.meta}>{copied ? " Nothing has been sent." : " Select the text to copy if needed."}</span></details>
    <details><summary>Why this question matters</summary><p>These are hypothetical outcomes from changing one building fact. Other unknowns remain. A public record alone does not establish which protection covers a tenant.</p>
      <ul>{q.branches.map((b,i) => <li key={i}><strong>{b.label}</strong>: {b.resolved.length ? b.resolved.map(r => `${q.rules.find(x => x.rule_id === r.rule_id)?.citation ?? r.rule_id}: ${r.aspect === "value" ? "amount becomes clearer" : ({applies:"building condition met",superseded:"local rule governs",not_applicable:"building condition not met"} as Record<string,string>)[r.result] ?? r.result}`).join("; ") : "This answer alone leaves the question unresolved."}</li>)}</ul>
      {q.rules.map(r => <blockquote key={r.rule_id}>{r.quote && <p>“{r.quote}”</p>}<SourceLink url={r.source_url}>{r.citation}</SourceLink></blockquote>)}
    </details>
  </article>;
}
export default function BuildingEvidencePanel({ evidence }: { evidence: EvidenceView }) {
  const [confirmed, setConfirmed] = useState(false);
  if (evidence.status === "unavailable") return null;
  if (evidence.status === "stale") return <section className={styles.panel} id="building-evidence"><h2>Building records</h2><p>The evidence review needs refreshing for this version of the law data. It is not used in the legal answers.</p></section>;
  const d = evidence.data;
  const leads = [...d.leads].sort((a,b) => Number(b.comparison === "review_difference") - Number(a.comparison === "review_difference"));
  return <section className={styles.panel} id="building-evidence" aria-labelledby="evidence-heading">
    <div><span className={styles.eyebrow}>Public records · for review</span><h2 id="evidence-heading">A closer look at this building</h2><p>Records can help check a missing fact or show a difference worth investigating.</p></div>
    {!confirmed ? <div className={styles.confirm}><p>These records are for <strong>{d.street}, {d.city}</strong>. Check the street number before opening them.</p><button className={styles.button} type="button" onClick={() => setConfirmed(true)}>Show records for this building</button></div> : <>
      <p className={styles.notice}>Evidence for review, not verified building facts. The legal answers and rating have not been changed by these records. Your unit may differ. Not legal advice.</p>
      {d.questions.slice(0,1).map(q => <Question key={q.fact} q={q} first />)}
      {d.questions.length > 1 && <details><summary>{d.questions.length - 1} more useful question{d.questions.length > 2 ? "s" : ""}</summary>{d.questions.slice(1).map(q => <Question key={q.fact} q={q} first={false} />)}</details>}
      {!d.questions.length && <p>No single building-fact question in this plan resolves an uncertain answer. Records may still reveal a difference; tenant-specific conditions remain.</p>}
      <details open><summary>{leads.length ? `${leads.length} public-record lead${leads.length > 1 ? "s" : ""}` : "Public-record search"}</summary>
        {!leads.length && <p>No usable record lead was found in this snapshot. This does not establish that a protection is absent.</p>}
        {leads.map((l,i) => <Lead key={`${l.source_id}-${l.source_record_id}-${l.fact}-${i}`} lead={l} />)}
        {d.matches.filter(m => ["ambiguous", "address_range_candidate"].includes(m.match)).map(m => <p className={styles.notice} key={m.source}>{SOURCE_NAMES[m.source] ?? m.source}: {m.candidate_count} possible record{m.candidate_count !== 1 ? "s" : ""}. The address range or parcel match needs checking; none is accepted as the building’s facts.</p>)}
      </details>
      <p className={styles.meta}>Law evaluated as of {d.as_of}. Record periods and retrieval dates are shown separately. Records can describe a parcel or housing project containing several buildings.</p>
    </>}
  </section>;
}
