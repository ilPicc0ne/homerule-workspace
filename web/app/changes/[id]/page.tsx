import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { icons } from "../../icons";
import { changes } from "@/lib/changes/data.ts";
import { addressChange, render } from "@/lib/changes/email.ts";
import type { Change, Entry } from "@/lib/changes/types.ts";
import { changeLine, entryHeading, longDate, resultWords, ruleName } from "@/lib/changes/wording.ts";
import data from "@/data/addresses.resolved.json" with { type: "json" };
import s from "./changes.module.css";

/*
  /changes/[id]: one sample address's change log (old → new, dated) and, below it, the alert email preview
  rendered from the same diff (I6). Preview only: nothing is sent from here.
*/

type Params = { id: string };

const knownIds = new Set((data as unknown as { addresses: { address_id: string }[] }).addresses.map((a) => a.address_id));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const label = changes.addresses[id]?.label ?? id;
  return {
    title: `Changes · ${label} · HomeRule`,
    description: "What changed in the housing rules for this address, old → new, with quotes and dates. Not legal advice.",
    robots: { index: false },
  };
}

function ChangeItem({ c }: { c: Change }) {
  const url = c.source_url && /^https?:\/\//.test(c.source_url) ? c.source_url : null;
  const why = c.after?.explanation ?? c.before?.explanation;
  return (
    <li className={s.change}>
      <p className={s.rule}>{ruleName(c)}</p>
      <p className={s.flip}>
        <span className={s.old}>{resultWords(c.before)}</span>
        <span aria-hidden="true" className={s.arrow}>→</span>
        <span className="sr-only"> to </span>
        <strong className={s.new}>{resultWords(c.after)}</strong>
      </p>
      {(c.conflict_flag_changed || c.after?.conflict_flag) && (
        <p className={s.flag}>{changeLine(c).split("; ").find((p) => p.includes("conflict"))}</p>
      )}
      {why && <p className={s.why}>{why}</p>}
      {c.requirement_quote && <blockquote className={s.quote}>&ldquo;{c.requirement_quote}&rdquo;</blockquote>}
      <p className={s.meta}>
        {c.citation ?? "Citation not stated"} · in effect from {longDate(c.effective_from)}
        {url && (
          <>
            {" · "}
            <a href={url} target="_blank" rel="noopener noreferrer">
              Official source
            </a>
          </>
        )}
      </p>
    </li>
  );
}

function EntryBlock({ e }: { e: Entry }) {
  return (
    <section className={s.entry} aria-label={entryHeading(e)}>
      {e.demo_label && <p className={s.demo}>{e.demo_label}: built from a fictional test document, not real law.</p>}
      <p className={s.when}>
        <time dateTime={e.after_as_of}>{entryHeading(e)}</time>
      </p>
      <p className={s.sourceTitle}>{e.title}</p>
      <ul className={s.changes}>
        {e.changes.map((c) => (
          <ChangeItem key={c.team_rule_id} c={c} />
        ))}
      </ul>
    </section>
  );
}

export default async function ChangesPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const rec = changes.addresses[id];
  if (!rec && !knownIds.has(id)) notFound();
  const label = rec?.label ?? id;
  const email = rec ? addressChange(changes, id) : null;
  const mail = email ? render(email) : null;

  return (
    <>
      <header className="wrap top">
        <Link href="/" className="brand">
          <span className="brand-mark">{icons.home}</span>
          HomeRule
        </Link>
      </header>
      <main className={`wrap ${s.main}`}>
        <p className={s.banner}>
          <strong>Not legal advice.</strong> Which published housing rules may apply here, and what changed, with quotes and
          dates. As of {longDate(changes.as_of)}.
        </p>
        <h1 className={s.title}>What changed for {label}</h1>
        <p className={s.sub}>Old → new for each rule, from the same comparison that would send the alert email below.</p>

        {rec ? (
          rec.entries.map((e) => <EntryBlock key={e.source} e={e} />)
        ) : (
          <p className={s.empty}>
            No change recorded for this address between the dates HomeRule compares.
          </p>
        )}

        {mail && email && (
          <section className={s.preview} aria-labelledby="preview-title">
            <h2 id="preview-title">Alert email preview</h2>
            <p className={s.small}>
              Preview only, nothing is sent. This is the email a subscriber to this address would get for:{" "}
              {email.entry.title}.
            </p>
            <dl className={s.headers}>
              <div>
                <dt>From</dt>
                <dd>{mail.from}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{mail.subject}</dd>
              </div>
              <div>
                <dt>List-Unsubscribe</dt>
                <dd>{mail.headers["List-Unsubscribe"]}</dd>
              </div>
            </dl>
            <iframe className={s.frame} title="Alert email preview (HTML)" sandbox="" srcDoc={mail.html} />
            <details className={s.text}>
              <summary>Plain-text part</summary>
              <pre>{mail.text}</pre>
            </details>
          </section>
        )}
      </main>
      <footer className="wrap footer">
        <p>Not legal advice. Shows which published housing rules may apply to an address and what changed. As of {changes.as_of}.</p>
      </footer>
    </>
  );
}
