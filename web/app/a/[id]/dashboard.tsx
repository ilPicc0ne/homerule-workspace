"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import AsOfTimeline from "@/components/as-of-timeline";
import { icons } from "@/components/icons";
import QuestionCard, { ruleHref, QuoteBlock } from "@/components/question-card";
import { Dot } from "@/components/status";
import { useAsOf, useHydrated } from "@/lib/as-of";
import { formatDate } from "@/lib/format";
import {
  CATEGORY_SHORT,
  RESULT_WORDS,
  buildCards,
  diffResults,
  nextChange,
  resultWord,
  ruleStatusOn,
  type ChangeEntry,
} from "@/lib/law";
import type { Address, Result, ResultValue, Rule, RuleStatus } from "@/lib/types";

type Props = {
  address: Address;
  lookups: Record<string, Result[]>;
  rules: Record<string, Rule>;
  stops: { date: string; label: string }[];
  fallback: string;
  retrieved: string;
  simulation?: Rule;
  rail: { map: ReactNode; where: ReactNode; facts: ReactNode };
};

const SIM_DATE = "2026-10-04";

const EVENT_WORDS: Record<RuleStatus, string> = {
  in_force: "Takes effect",
  not_yet_effective: "Signed into law, not yet in force",
  pending: "Proposed",
  failed: "Struck, never became law",
  effective_date_disputed: "First of two published effective dates",
};

function simulatedResult(rule: Rule, asOf: string): Result {
  const inForce = rule.effective_date !== null && asOf >= rule.effective_date;
  return {
    rule_id: rule.rule_id,
    category: rule.category,
    result: inForce ? "applies" : "not_yet_effective",
    confidence: 0,
    explanation: inForce
      ? "Demo only: the placeholder ordinance would be in force on this date."
      : `Demo only: the placeholder ordinance would take effect on ${formatDate(rule.effective_date)}.`,
    what_next: rule.what_next,
  };
}

export default function Dashboard({ address, lookups, rules, stops, fallback, retrieved, simulation, rail }: Props) {
  const dates = stops.map((s) => s.date);
  const asOf = useAsOf(dates, fallback);
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const allRules = useMemo(
    () => (simulation ? { ...rules, [simulation.rule_id]: simulation } : rules),
    [rules, simulation],
  );

  const results = useMemo(() => {
    const base = lookups[asOf] ?? [];
    return simulated && simulation ? [...base, simulatedResult(simulation, asOf)] : base;
  }, [lookups, asOf, simulated, simulation]);

  const cards = useMemo(() => buildCards(results, allRules), [results, allRules]);

  const counts = {
    applies: cards.filter((c) => c.status === "applies").length,
    unknown: cards.filter((c) => c.status === "unknown").length,
    none: cards.filter((c) => c.status === "none").length,
    changing: cards.filter((c) => c.changing).length,
  };
  const firstOf = (pred: (c: (typeof cards)[number]) => boolean) => {
    const c = cards.find(pred);
    return c ? `#q-${c.category}` : undefined;
  };

  // Rules this address ever lists (any date), for "coming up".
  const touched = useMemo(() => {
    const ids = new Set<string>();
    Object.values(lookups).forEach((list) => list.forEach((r) => ids.add(r.rule_id)));
    if (simulated && simulation) ids.add(simulation.rule_id);
    return [...ids].map((id) => allRules[id]).filter(Boolean);
  }, [lookups, simulated, simulation, allRules]);

  const coming = touched
    .map((r) => ({ rule: r, next: nextChange(r, asOf), now: ruleStatusOn(r, asOf) }))
    .filter((x) => x.next || x.now === "pending")
    .sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999"));

  // Change log: one diff per pair of tracked dates, up to the chosen date.
  const log: { from: string; to: string; entries: ChangeEntry[] }[] = [];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] > asOf) break;
    const entries = diffResults(lookups[dates[i - 1]] ?? [], lookups[dates[i]] ?? []);
    if (entries.length) log.push({ from: dates[i - 1], to: dates[i], entries });
  }
  log.reverse();
  const simEntry: ChangeEntry | null =
    simulated && simulation ? { rule_id: simulation.rule_id, from: null, to: simulatedResult(simulation, asOf).result } : null;

  const checkedFor = (category: string) =>
    Object.values(rules).filter(
      (r) => r.category === category && r.kind === "rule" && ruleStatusOn(r, asOf) === "in_force" && !results.some((x) => x.rule_id === r.rule_id),
    );

  const city = address.postal_city;

  return (
    <main className="wrap dash">
      <div className="dash-head page-head">
        <h1>{address.street}</h1>
        <p className="page-sub">
          {city}, {address.state_code} <span className="tag tag-demo">Demo data</span>
        </p>
      </div>

      <div className="dash-time">
        <AsOfTimeline stops={stops} fallback={fallback} retrieved={retrieved} />
      </div>

      <aside className="dash-rail" aria-label="About this address">
        <div className="rail-block">
          <h2 className="rail-title">Email me when the law changes for this address</h2>
          <form
            className="alert-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              setSubscribed(true);
            }}
          >
            <label htmlFor="alert-email" className="sr-only">
              Your email
            </label>
            <input
              id="alert-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              disabled={!hydrated}
              onChange={(ev) => setEmail(ev.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!hydrated}>
              {icons.bell} Email me
            </button>
            <p className="status-msg" role="status">
              {subscribed && "Alerts launch with double opt-in. Nothing was stored."}
            </p>
          </form>
        </div>
        <div className="rail-block">{rail.map}</div>
        <div className="rail-block">{rail.where}</div>
        <div className="rail-block">{rail.facts}</div>
      </aside>

      <div className="dash-main">
        <nav className="chips" aria-label="Summary">
          <a className="chip" href={firstOf((c) => c.status === "applies")}>
            <Dot kind="applies" /> <b>{counts.applies}</b> apply
          </a>
          <a className="chip" href={firstOf((c) => c.status === "unknown")}>
            <Dot kind="unknown" /> <b>{counts.unknown}</b> unknown
          </a>
          <a className="chip" href={firstOf((c) => c.changing)}>
            <Dot kind="not_yet_effective" /> <b>{counts.changing}</b> changing
          </a>
          <a className="chip" href={firstOf((c) => c.status === "none")}>
            <Dot kind="none" /> <b>{counts.none}</b> none
          </a>
        </nav>

        <div className="questions">
          {cards.map((card) => (
            <QuestionCard
              key={card.category}
              card={card}
              rules={allRules}
              checked={card.lead ? [] : checkedFor(card.category)}
              asOf={asOf}
              fallback={fallback}
              addressId={address.address_id}
            />
          ))}
        </div>

        <section className="section" aria-labelledby="coming-h">
          <h2 id="coming-h">Coming up</h2>
          <p className="section-sub">After {formatDate(asOf)}, for the rules on this page.</p>
          {coming.length === 0 ? (
            <p className="events muted">Nothing scheduled in our sources.</p>
          ) : (
            <ul className="events">
              {coming.map(({ rule, next }) => (
                <li key={rule.rule_id} className="event">
                  <span className="event-date">{next ? formatDate(next.date) : "No date"}</span>
                  <span className="event-what">
                    {rule.fictional ? (
                      <b>{rule.title}</b>
                    ) : (
                      <Link href={ruleHref(rule.rule_id, address.address_id, asOf, fallback)}>{rule.title}</Link>
                    )}
                    <span className="change">
                      {next ? EVENT_WORDS[next.status] : "Proposed, not law. No vote date in our sources."}
                      {rule.interaction.type === "may_preempt_local" && next?.status === "in_force" && rule.jurisdiction_id !== address.jurisdictions.city
                        ? " May conflict with local rules; flagged, not decided."
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="changes-h">
          <h2 id="changes-h">Changes</h2>
          <p className="section-sub">What changed for this address between the dates we track, old to new.</p>
          <ul className="events">
            {simEntry && simulation && (
              <li className="event sim-new">
                <span className="event-date">
                  {formatDate(SIM_DATE)}
                  <br />
                  demo ingest
                </span>
                <span className="event-what">
                  <ChangeLine entry={simEntry} rule={simulation} href={null} />
                </span>
              </li>
            )}
            {log.map((g) => (
              <li key={g.to} className="event">
                <span className="event-date">
                  {formatDate(g.from)}
                  <br />
                  to {formatDate(g.to)}
                </span>
                <span className="event-what">
                  {g.entries.map((e) => (
                    <ChangeLine
                      key={e.rule_id}
                      entry={e}
                      rule={allRules[e.rule_id]}
                      href={ruleHref(e.rule_id, address.address_id, asOf, fallback)}
                    />
                  ))}
                </span>
              </li>
            ))}
            {log.length === 0 && !simEntry && <li className="muted">No changes up to {formatDate(asOf)} in the dates we track.</li>}
          </ul>

          {simulation && (
            <div className="sim">
              <p>
                Rehearse the hour-16 drop: add a fictional Cambridge ordinance, as the ingest will add the real one. It
                runs in your browser only.
              </p>
              <button type="button" className="btn btn-quiet" onClick={() => setSimulated((s) => !s)}>
                {simulated ? "Undo the demo ingest" : "Demo: simulate the hour-16 ordinance"}
              </button>
              {simulated && simEntry && (
                <EmailPreview
                  address={address}
                  rule={simulation}
                  entry={simEntry}
                  asOf={asOf}
                  to={subscribed && email ? email : "you@example.com"}
                />
              )}
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="how-h">
          <h2 id="how-h">How this works</h2>
          <div className="how">
            <p>
              The law is read once into rules, each with a verbatim quote and its dates. Code, not a model, decides
              whether a rule covers this building on the chosen date.
            </p>
            <p>When a fact is missing, the answer says &ldquo;unknown&rdquo; and names the fact, instead of guessing.</p>
            <p>
              Conflicts between levels are flagged for human review, never decided. Not legal advice: for your own case,
              ask the agency named on each card or a lawyer.
            </p>
            <p className="muted small">
              Demo data: these results are hand-prepared from the challenge brief. The rule engine will replace them.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ChangeLine({ entry, rule, href }: { entry: ChangeEntry; rule: Rule | undefined; href: string | null }) {
  const title = rule?.title ?? entry.rule_id;
  const word = (v: ResultValue | null) => (
    <span className={v ? `word-${v}` : "muted"}>
      {v && <Dot kind={v} />} {resultWord(v)}
    </span>
  );
  return (
    <span className="change-entry">
      <span>
        {href ? <Link href={href}>{title}</Link> : <b>{title}</b>}
        {rule && <span className="muted"> ({CATEGORY_SHORT[rule.category]})</span>}
      </span>
      <span className="change">
        {word(entry.from)}
        <span className="arrow" aria-label="to">
          →
        </span>
        {word(entry.to)}
        {entry.conflictAdded && <span>, conflict flagged</span>}
      </span>
    </span>
  );
}

function EmailPreview({
  address,
  rule,
  entry,
  asOf,
  to,
}: {
  address: Address;
  rule: Rule;
  entry: ChangeEntry;
  asOf: string;
  to: string;
}) {
  return (
    <article className="mail" aria-label="Email preview">
      <div className="mail-head">
        <p>
          <span>From</span> HomeRule &lt;alerts@yourhomerule.com&gt;
        </p>
        <p>
          <span>To</span> {to}
        </p>
        <p>
          <span>Subject</span> A law change for {address.street}, {address.postal_city} (demo)
        </p>
      </div>
      <div className="mail-body">
        <h3>A new rule may affect {address.street}</h3>
        <p>
          <b>{rule.title}</b>
          <br />
          {resultWord(entry.from)} → {RESULT_WORDS[entry.to ?? "pending"]}. Takes effect {formatDate(rule.effective_date)}.
        </p>
        <QuoteBlock rule={rule} />
        <p className="muted small">
          As of {formatDate(asOf)}. Demo data: a fictional placeholder until the real hour-16 ordinance is released. Not
          legal advice.
        </p>
      </div>
      <p className="mail-foot">
        You get this because you asked for alerts for {address.street}. Unsubscribe with one click. Preview only:
        nothing was sent.
      </p>
    </article>
  );
}
