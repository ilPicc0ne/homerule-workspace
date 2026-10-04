import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changes } from "@/lib/changes/data.ts";
import { addressChange, render } from "@/lib/changes/email.ts";
import type { Change, Entry, Side } from "@/lib/changes/types.ts";
import { badgeFor, PAGE_BADGES } from "@/lib/changes/impact.ts";
import { changeLine, entryHeading, longDate, resultWords, ruleName } from "@/lib/changes/wording.ts";
import { formatDate } from "@/lib/format";
import { getDataset } from "@/lib/data";
import resolved from "@/data/addresses.resolved.json" with { type: "json" };
import { fontVars } from "../../a/fonts";
import { searchIndex } from "../../a/view-props";
import { StickyBar } from "../../a/[id]/address-page";
import { Ic } from "../../a/[id]/sprite";
import { TopicChip, VerdictLabel } from "../../a/[id]/verdict-badge";
import { TOPICS } from "@/lib/plain";
import "../../a/[id]/v3.css";
import s from "./changes.module.css";

/*
  /changes/[id]: one sample address's change log (old → new, dated) and, below it, the alert email preview
  rendered from the same diff (I6). Preview only: nothing is sent from here. Styled to mockup v3 like /a/[id]:
  the v3 sticky bar is the only header (v3.css hides the site header), a back-link leads to the address.
*/

type Params = { id: string };

const knownIds = new Set((resolved as unknown as { addresses: { address_id: string }[] }).addresses.map((a) => a.address_id));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const label = changes.addresses[id]?.label ?? id;
  return {
    title: `Changes · ${label}`,
    description: "What changed in the housing rules for this address, old → new, with quotes and dates. Not legal advice.",
    robots: { index: false },
  };
}

/** A result in the v3 status colours: green applies, amber unknown, blue not yet in effect, slate otherwise. */
const RESULT_CLS: Record<Side["result"], { cls: string; icon: string }> = {
  applies: { cls: "applies", icon: "g-check" },
  unknown: { cls: "depends", icon: "g-q" },
  not_yet_effective: { cls: "starts", icon: "i-cal" },
  superseded: { cls: "replaced", icon: "i-turn" },
  pending: { cls: "proposed", icon: "i-dash" },
};

function Result({ side, old }: { side: Side | null; old?: boolean }) {
  const r = side ? RESULT_CLS[side.result] : { cls: "replaced", icon: "i-dash" };
  return (
    <span className={`${s.res} ${s[r.cls]} ${old ? s.old : ""}`}>
      <Ic id={r.icon} />
      {resultWords(side)}
    </span>
  );
}

function ChangeItem({ c, anchor }: { c: Change; anchor: boolean }) {
  const url = c.source_url && /^https?:\/\//.test(c.source_url) ? c.source_url : null;
  const why = c.after?.explanation ?? c.before?.explanation;
  const badge = PAGE_BADGES ? badgeFor(c) : null;
  const topic = TOPICS.find((t) => t.cat === c.category);
  const flag = (c.conflict_flag_changed || c.after?.conflict_flag) && changeLine(c).split("; ").find((p) => p.includes("conflict"));
  return (
    <li className={`${s.change} ${badge ? `cl-v v-${badge.kind}` : ""}`} id={anchor ? `c-${c.team_rule_id}` : undefined}>
      <p className="ev-top">
        {badge && <VerdictLabel b={badge} />}
        {topic && <TopicChip title={topic.title} icon={topic.icon} />}
      </p>
      <p className="r-t">{ruleName(c)}</p>
      {badge?.why && <p className="ev-why">{badge.why}</p>}
      <p className={s.flip}>
        <span className="sr">Before: </span>
        <Result side={c.before} old />
        <span aria-hidden="true" className={s.arrow}>
          →
        </span>
        <span className="sr"> now: </span>
        <Result side={c.after} />
      </p>
      {flag && (
        <p className="ev-flag">
          <Ic id="i-flag" />
          {flag[0].toUpperCase() + flag.slice(1)}
        </p>
      )}
      {why && <p className={s.why}>{why}</p>}
      {c.requirement_quote && <blockquote className="bq">&ldquo;{c.requirement_quote}&rdquo;</blockquote>}
      <p className={s.cite}>
        <b>{c.citation ?? "Citation not stated"}</b>
        <span>In effect from {longDate(c.effective_from)}</span>
        {url && (
          <a className="src" href={url} target="_blank" rel="noopener noreferrer">
            Official source
            <Ic id="i-ext" />
            <span className="sr"> (opens in a new tab)</span>
          </a>
        )}
      </p>
    </li>
  );
}

function EntryBlock({ e, seen }: { e: Entry; seen: Set<string> }) {
  return (
    <section className={s.entry} aria-label={entryHeading(e)}>
      {e.demo_label && (
        <p className="ev-flag">
          <Ic id="i-flag" />
          {e.demo_label}: built from a fictional test document, not real law.
        </p>
      )}
      <p className={s.when}>
        <Ic id="i-cal" />
        <time dateTime={e.after_as_of}>{entryHeading(e)}</time>
      </p>
      <h2 className={s.entryTitle}>{e.title}</h2>
      <ul className={s.changes}>
        {e.changes.map((c) => {
          const first = !seen.has(c.team_rule_id);
          seen.add(c.team_rule_id);
          return <ChangeItem key={c.team_rule_id} c={c} anchor={first} />;
        })}
      </ul>
    </section>
  );
}

export default async function ChangesPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const rec = changes.addresses[id];
  if (!rec && !knownIds.has(id)) notFound();
  const data = getDataset();
  const address = data?.addresses.find((a) => a.address_id === id);
  const label = rec?.label ?? id;
  const street = address?.street ?? label.split(",")[0];
  const asOf = data?.meta.default_as_of ?? changes.as_of;
  const asOfText = formatDate(asOf);
  const email = rec ? addressChange(changes, id) : null;
  const mail = email ? render(email) : null;
  const seen = new Set<string>();

  return (
    <div className={fontVars}>
      <div className="v3">
        <StickyBar
          street={street}
          current={address ? `${address.street}, ${address.postal_city}, ${address.state_code}` : label}
          index={data ? searchIndex(data) : []}
          asOfText={asOfText}
        />
        <main id="main">
          <div className={`wrap ${s.page}`}>
            {knownIds.has(id) && (
              <p className={s.back}>
                <Link href={`/a/${encodeURIComponent(id)}`}>
                  <Ic id="i-arrow" />
                  Back to {street}
                </Link>
              </p>
            )}
            <div className={s.hero}>
              <p className={s.kicker}>Change log</p>
              <h1 className={s.title}>What changed for {street}</h1>
              <p className="sec-sub">{label}. Old → new for each rule, from the same comparison that sends the alert email.</p>
              <ul className="trust" aria-label="About these answers">
                <li>
                  <Ic id="i-quote" />
                  Quoted from the law
                </li>
                <li>
                  <Ic id="i-cal" />
                  Changes as of {longDate(changes.as_of)}
                </li>
                <li>
                  <Ic id="i-info" />
                  Not legal advice
                </li>
              </ul>
            </div>

            {rec ? (
              rec.entries.map((e) => <EntryBlock key={e.source} e={e} seen={seen} />)
            ) : (
              <p className={`${s.entry} ${s.empty}`}>No change recorded for this address between the dates HomeRule compares.</p>
            )}

            {mail && email && (
              <section className={s.preview} aria-labelledby="preview-title">
                <h2 className="sec-h" id="preview-title">
                  Alert email preview
                </h2>
                <p className="sec-sub">
                  Preview only, nothing is sent. This is the email a subscriber to this address would get for: {email.entry.title}.
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
                  <summary>
                    <Ic id="i-mail" />
                    <span>Plain-text part</span>
                    <Ic id="i-chev" className={s.chev} />
                  </summary>
                  <pre>{mail.text}</pre>
                </details>
              </section>
            )}
          </div>
        </main>
        <footer className="foot">
          <div className="wrap">
            <h2>How the change log works</h2>
            <p>
              HomeRule checks every rule against this building on two dates and lists what moved: a rule that starts to apply, one that is
              replaced, a new conflict flag. Each line quotes the law and shows its date. The alert email is built from the same list, so the
              two can’t disagree.
            </p>
            <p className="fine">
              Not legal advice: HomeRule shows what published rules say, not how they apply to your own case. Built at Hack-Nation 7 for the
              RealPage challenge.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
