"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import AddressMap from "@/components/address-map";
import BrandMark from "@/components/brand-mark";
import AlertForm from "@/components/alerts/alert-form";
import ExampleAlert from "@/components/alerts/example-alert";
import type { MapProps } from "@/components/address-map-gl";
import type { AddressView, Helper, RuleRow, Tile, TileStatus, TimelineEvent } from "@/lib/address-view";
import { DATA_SOURCE } from "@/lib/config";
import { GROUPS, TOPICS } from "@/lib/plain";
import { Ic, Sprite } from "./sprite";

/*
  The one-view address page, built to mockup v3 (lab/ui-proposal/v3): sticky address bar with
  search and "Get alerts", next change, small real map, at a glance, six accordion tiles with
  three levels (plain answer → next step → "Show the law"), coming up. Not legal advice.
*/

export type PageProps = {
  id: string;
  view: AddressView;
  hero: { crumb: string[]; cap: string; capSub?: string; facts: { icon: string; text: string; cls?: string }[]; factSrc: string; state: string };
  map: MapProps;
  index: { id: string; street: string; city: string; st: string }[];
  typed: boolean;
  /** This address's change log and the rules in it; null when nothing changed between the compared dates. */
  changeLog: { href: string; rules: string[] } | null;
};

const ST: Record<TileStatus, { w: string; g: string }> = {
  protect: { w: "There’s a rule", g: "g-check" },
  depends: { w: "We’re missing one fact", g: "g-q" },
  none: { w: "No local rule — state basics only", g: "g-dot" },
};

const RST_ICON: Record<RuleRow["st"], string> = { applies: "g-check", replaced: "i-turn", depends: "g-q", starts: "i-cal", proposed: "i-dash" };
const NOTE_ICON = { depends: "g-q", flag: "i-flag", date: "i-cal", proposed: "i-dash" } as const;

const Mark = ({ st }: { st: TileStatus }) => (
  <span className="mark">
    <Ic id={ST[st].g} />
  </span>
);

/** Verbatim quote with curly quotes; an ellipsis where the excerpt starts or ends mid-sentence. */
function q(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  const lead = /^[a-z]/.test(t) ? "…" : "";
  let tail = "";
  if (/[;:,]$/.test(t)) {
    t = t.slice(0, -1);
    tail = "…";
  } else if (!/[.!?”"')]$/.test(t)) tail = "…";
  return `“${lead}${t}${tail}”`;
}

// ---------------------------------------------------------------- sticky bar

function SearchField({ current, index }: { current: string; index: PageProps["index"] }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState(current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => {
    const terms = text.toLowerCase().replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
    if (!terms.length || text === current) return [];
    return index.filter((a) => terms.every((t) => `${a.street} ${a.city} ${a.st}`.toLowerCase().includes(t))).slice(0, 6);
  }, [text, index, current]);
  const go = (a: PageProps["index"][number]) => {
    setOpen(false);
    setText(`${a.street}, ${a.city}, ${a.st}`);
    router.push(`/a/${a.id}`);
  };
  const submit = () => {
    if (active >= 0 && matches[active]) return go(matches[active]);
    if (matches[0]) return go(matches[0]);
    if (text.trim() && text !== current) router.push(`/a/at?q=${encodeURIComponent(text.trim())}`);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setOpen(false);
      setText(current);
    }
  };
  const show = open && text.trim() !== "" && text !== current;
  return (
    <div className="look">
      <label className="fld-l" htmlFor={`${id}-a`}>
        Your address
      </label>
      <div className="fld">
        <Ic id="i-search" />
        <input
          id={`${id}-a`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={`${id}-l`}
          aria-activedescendant={show && active >= 0 ? `${id}-o${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Type your address"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
        {text && (
          <button type="button" className="clear" aria-label="Clear the address" onClick={() => setText("")}>
            <Ic id="i-x" />
          </button>
        )}
      </div>
      {show && (
        <ul className="sugg" id={`${id}-l`} role="listbox" aria-label="Addresses">
          {matches.map((a, i) => (
            <li
              key={a.id}
              id={`${id}-o${i}`}
              className="opt"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(a)}
            >
              <span className="opt-st" aria-hidden="true">
                {a.st}
              </span>
              <span className="opt-t">
                <span className="opt-a">{a.street}</span>
                <span className="opt-c">
                  {a.city}, {a.st}
                </span>
              </span>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="sugg-none" role="presentation">
              <b>Not one of our 500 sample addresses.</b> Press Enter to look it up with the US Census.
            </li>
          )}
          <li className="sugg-foot" role="presentation">
            HomeRule covers 3 states and 10 cities; 500 sample addresses have building records.
          </li>
        </ul>
      )}
    </div>
  );
}

const icon = (id: string) => <Ic id={id} />;

function Alerts({ id, street, open, setOpen }: { id: string; street: string; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <div className="alwrap">
      <button type="button" className="bell" aria-expanded={open} aria-label={`Get alerts for ${street}`} onClick={() => setOpen(!open)}>
        <Ic id="i-bell" />
        <span className="bell-l">Get alerts</span>
      </button>
      <AlertForm addressId={id} street={street} open={open} onClose={() => setOpen(false)} icon={icon} />
    </div>
  );
}

const SourcePill = () => <span className="demo">{DATA_SOURCE === "demo" ? "Demo data" : "Live data"}</span>;

// ---------------------------------------------------------------- tiles

function Contact({ t }: { t: Tile }) {
  const c = t.contact;
  if (!c) return null;
  return (
    <div className="who">
      <p className="who-h">
        <Ic id="i-phone" />
        Talk to someone first
      </p>
      <p className="who-o">
        <a href={c.url} target="_blank" rel="noopener">
          {c.name}
        </a>
      </p>
      <p className="who-r">
        {c.phone && (
          <a className="who-ph" href={`tel:${c.tel}`}>
            {c.phone}
          </a>
        )}
        {c.free && <span className="free">Free</span>}
        {c.phone && <span className="demo-n">Number not yet checked by us, confirm before calling</span>}
      </p>
      <p className="who-n">{c.whatFor}.</p>
      {c.eligibility && <p className="who-src">{c.eligibility}</p>}
    </div>
  );
}

function HelperBox({ h }: { h: Helper }) {
  const [copied, setCopied] = useState(false);
  if (h.kind === "email") {
    return (
      <details className="hlp mail">
        <summary>
          <Ic id="i-mail" />
          <span>{h.title}</span>
          <Ic id="i-chev" className="chev" />
        </summary>
        <p className="hlp-s">A ready, neutral message. Copy it into your own email; HomeRule sends nothing.</p>
        <textarea className="hlp-t" readOnly rows={7} aria-label="Email text" value={h.text} />
        <button
          type="button"
          className="btn2"
          onClick={() => {
            navigator.clipboard?.writeText(h.text).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Ic id="i-copy" />
          {copied ? "Copied. Nothing was sent." : "Copy text"}
        </button>
      </details>
    );
  }
  return (
    <div className="hlp">
      <p className="hlp-h">
        <Ic id="i-list" />
        {h.title}
      </p>
      <ul className="ck">
        {h.items.map((it) => (
          <li key={it}>
            <label>
              <input type="checkbox" />
              {it}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Rule({ r, addressId }: { r: RuleRow; addressId: string }) {
  return (
    <li className="rule">
      <p className="r-top">
        <span className="lvl">
          <Ic id={r.level === "city" ? "i-building" : "i-capitol"} />
          {r.where}
        </span>
        <span className={`rst ${r.st}`}>
          <Ic id={RST_ICON[r.st]} />
          {r.stWord}
        </span>
      </p>
      <p className="r-t">{r.title}</p>
      {r.quote ? <blockquote className="bq">{q(r.quote)}</blockquote> : <p className="q-pend">Quote pending: the text isn’t in our sources yet.</p>}
      {r.why && <p className="why">{r.why}</p>}
      <p className="cite">
        <b>{r.citation}</b>
        {r.sourceUrl && (
          <a className="src" href={r.sourceUrl} target="_blank" rel="noopener">
            {r.sourceName ?? "Source"}
            <Ic id="i-ext" />
            <span className="sr"> (opens in a new tab)</span>
          </a>
        )}
      </p>
      <p className="meta">
        {r.meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </p>
      <p className="law-foot">
        <Link href={`/r/${encodeURIComponent(r.rule_id)}?from=${addressId}`}>See the full rule and every building it reaches</Link>
      </p>
    </li>
  );
}

function TileView({ t, open, onToggle, addressId }: { t: Tile; open: boolean; onToggle: () => void; addressId: string }) {
  return (
    <article className={`tile s-${t.status}${open ? " open" : ""}`} id={`t-${t.id}`}>
      <h4 className="tile-h">
        <button type="button" className="tile-btn" aria-expanded={open} aria-controls={`p-${t.id}`} onClick={onToggle}>
          <span className="well">
            <Ic id={t.icon} />
          </span>
          <span className="t-title" id={`tt-${t.id}`}>
            {t.title}
          </span>
          <span className="t-tag">
            <span className="tag">
              <Mark st={t.status} />
              {ST[t.status].w}
            </span>
          </span>
          <span className="t-line">{t.line}</span>
          {t.notes.length > 0 && (
            <span className="t-notes">
              {t.notes.map((n) => (
                <span key={n.text} className={`note n-${n.kind}`}>
                  <Ic id={NOTE_ICON[n.kind]} />
                  {n.text}
                </span>
              ))}
            </span>
          )}
          <span className="t-foot">
            <span className="t-from">
              <Ic id={t.fromCity ? "i-building" : "i-capitol"} />
              {t.from}
            </span>
            <span className="t-more">
              <span className="t-more-l">{open ? "Hide details" : "Show details"}</span>
              <Ic id="i-chev" />
            </span>
          </span>
        </button>
      </h4>
      <div className="t-body" id={`p-${t.id}`} role="region" aria-labelledby={`tt-${t.id}`} inert={!open}>
        <div className="t-in">
          <div className="panel">
            <h5 className="d-q">{t.q}</h5>
            <p className="d-ex">{t.expl}</p>
            {t.missing.length > 0 && (
              <div className="box s-depends">
                <p className="box-h">
                  <Mark st="depends" />
                  What we don’t know yet
                </p>
                <ul>
                  {t.missing.map((m) => (
                    <li key={m.fact + m.why}>
                      <b>{m.fact}.</b> {m.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h5 className="d-h">What you can do next</h5>
            <Contact t={t} />
            {t.helpers.map((h) => (
              <HelperBox key={h.title} h={h} />
            ))}
            {t.next.length > 0 && (
              <ul className="acts">
                {t.next.map((a) => (
                  <li key={a.url}>
                    <a className="act" href={a.url} target="_blank" rel="noopener">
                      <Ic id="i-arrow" className="lead" />
                      <span>{a.label}</span>
                      <Ic id="i-ext" className="go" />
                      <span className="sr"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {t.rules.length > 0 && (
              <details className="law">
                <summary>
                  <Ic id="i-quote" />
                  <span>Show the law</span>
                  <Ic id="i-chev" className="chev" />
                </summary>
                <div className="law-in">
                  {t.lawNotes.length > 0 && (
                    <ul className="law-notes">
                      {t.lawNotes.map((n) => (
                        <li key={n} className="note n-replaced">
                          <Ic id="i-turn" />
                          {n}
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.flag && (
                    <div className="box">
                      <p className="box-h">
                        <Ic id="i-flag" />
                        {t.flag.head}
                      </p>
                      <p className="box-p">{t.flag.body}</p>
                    </div>
                  )}
                  <p className="qnote">Quotes are verbatim excerpts from the source documents.</p>
                  <ul className="rules">
                    {t.rules.map((r) => (
                      <Rule key={r.rule_id} r={r} addressId={addressId} />
                    ))}
                  </ul>
                </div>
              </details>
            )}
            <p className="d-foot">Not legal advice: what published rules say, not a decision on your case.</p>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- coming up

const topicTitle = (id: string) => TOPICS.find((t) => t.id === id)?.title ?? "";
const topicIcon = (id: string) => TOPICS.find((t) => t.id === id)?.icon ?? "i-info";

function Ev({ e, cls, log }: { e: TimelineEvent; cls: string; log: PageProps["changeLog"] }) {
  const linked = log?.rules.includes(e.ruleId);
  return (
    <li className={`ev ${cls}`}>
      <p className="ev-d">{e.dateText}</p>
      <p className="ev-tp">
        <Ic id={topicIcon(e.topic)} />
        {topicTitle(e.topic)}
      </p>
      <p className="ev-t">{e.title}</p>
      {e.body && <p className="ev-b">{e.body}</p>}
      {linked && (
        <Link className="ev-lk" href={`${log!.href}#c-${encodeURIComponent(e.ruleId)}`}>
          What changed, old → new
          <Ic id="i-arrow" />
        </Link>
      )}
    </li>
  );
}

function Ahead({ id, v, onAlerts, log }: { id: string; v: AddressView; onAlerts: () => void; log: PageProps["changeLog"] }) {
  return (
    <>
      <h2 className="sec-h" id="h-ahead">
        Coming up
      </h2>
      <p className="sec-sub">Dated changes for this address, and what changed in the last year.</p>
      <p className="ahead-alert">
        <button type="button" className="linkbtn" onClick={onAlerts}>
          <Ic id="i-bell" />
          Get alerts when the law changes here
        </button>
      </p>
      {/* A div, not a p: ExampleAlert renders a <dialog>, which can't sit inside a <p> (the browser
          closes the p early and React's hydration fails, error #418). */}
      <div className="ahead-alert ex-alert">
        <ExampleAlert addressId={id} icon={icon} />
      </div>
      {v.proposed.length > 0 && (
        <div className="prop">
          <h3 className="prop-h">
            <Ic id="i-dash" />
            Proposed, not law
          </h3>
          <p className="prop-s">Bills without a date. They change nothing unless they pass.</p>
          <ul>
            {v.proposed.map((b) => (
              <li key={b.rule_id}>
                <p className="prop-t">
                  {b.citation}: {b.title}
                </p>
                {b.url && (
                  <a className="src" href={b.url} target="_blank" rel="noopener">
                    Follow {b.citation}
                    <Ic id="i-ext" />
                    <span className="sr"> (opens in a new tab)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="tl">
        {v.future.length ? (
          v.future.map((e) => <Ev key={e.date + e.title} e={e} cls="future" log={log} />)
        ) : (
          <li className="ev nodate">
            <p className="ev-t">Nothing with a date yet</p>
            <p className="ev-b">No change is scheduled for this address as of {v.asOfText}.</p>
          </li>
        )}
        <li className="now">
          <span className="today-pill">Today</span>
          <span className="today-d">{v.asOfText}</span>
        </li>
        {v.past.length > 0 && <li className="tl-lab">Recently changed</li>}
        {v.past.map((e) => (
          <Ev key={e.date + e.title} e={e} cls="past" log={log} />
        ))}
      </ol>
      {log && (
        <p className="ahead-log">
          <Link className="src" href={log.href}>
            <Ic id="i-list" />
            See the full change log
          </Link>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- page

export default function AddressPageView(p: PageProps) {
  const { view: v, hero } = p;
  const [openTile, setOpenTile] = useState<string | null>(null);
  const [alerts, setAlerts] = useState(false);
  const counts = { protect: 0, depends: 0, none: 0 } as Record<TileStatus, number>;
  v.tiles.forEach((t) => counts[t.status]++);
  const n = (k: TileStatus, one: string, many: string) => `${counts[k]} ${counts[k] === 1 ? one : many}`;
  const sum: string[] = [];
  {
    if (counts.protect === 6) sum.push("There’s a rule for each of the 6 topics at this address.");
    else if (counts.protect) sum.push(`There’s a rule for ${n("protect", "topic", "topics")}.`);
    if (counts.depends) sum.push(`For ${n("depends", "topic", "topics")}, we’re missing one fact.`);
    if (counts.none) sum.push(`For ${n("none", "topic", "topics")}, there’s no local rule, so state basics apply.`);
  }

  const goTile = (id: string) => {
    setOpenTile(id);
    requestAnimationFrame(() => document.getElementById(`t-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const openAlerts = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setAlerts(true);
  };

  const logo: ReactNode = (
    <Link className="logo" href="/">
      <span className="logo-mark">
        <BrandMark />
      </span>
      HomeRule
    </Link>
  );

  return (
    <div className="v3">
      <Sprite />
      <div className="brandrow wrap">
        {logo}
        <span className="brand-r">
          <span className="nla">Not legal advice</span>
          <SourcePill />
        </span>
      </div>

      <header className="bar">
        <div className="bar-in wrap">
          {logo}
          <SearchField current={`${v.street}, ${v.postal}, ${hero.state}`} index={p.index} />
          <Alerts id={p.id} street={v.street} open={alerts} setOpen={setAlerts} />
          <div className="bar-trust">
            <SourcePill />
            <span className="nla2">Not legal advice · Law as of {v.asOfText}</span>
          </div>
        </div>
      </header>

      <main id="main">
        <div className="wrap page">
          <section className="hero" aria-labelledby="h-addr">
            <h1 className="addr" id="h-addr">
              {v.street}
            </h1>
            <p className="nxt">
              <span>
                {v.next ? (
                  <>
                    <b>Next change: {v.next.dateText}</b> — {topicTitle(v.next.topic).toLowerCase()}: {v.next.title.replace(/^Takes effect: /, "")}
                  </>
                ) : (
                  <>
                    <b>No changes scheduled</b> for this address
                  </>
                )}
              </span>
            </p>
            <div className="map-card">
              <AddressMap {...p.map} />
            </div>
            <div className="where">
              <p className="crumb">
                <span className="sr">Law from: </span>
                {hero.crumb.map((c, i) => (
                  <span key={c}>
                    {i > 0 && (
                      <span className="sep" aria-hidden="true">
                        ›{" "}
                      </span>
                    )}
                    {c}
                  </span>
                ))}
              </p>
              <p className="cap">{hero.cap}</p>
              {hero.capSub && <p className="cap-sub">{hero.capSub}</p>}
            </div>
            <ul className="facts" aria-label="Building facts">
              {hero.facts.map((f) => (
                <li key={f.text} className={`fact ${f.cls ?? ""}`}>
                  {f.cls?.includes("unk") && (
                    <span className="fq" aria-hidden="true">
                      ?
                    </span>
                  )}
                  {f.text}
                </li>
              ))}
            </ul>
            <p className="fact-src">{hero.factSrc}</p>
          </section>

          <section className="glance" aria-labelledby="h-glance">
            <div className="glance-sum">
              <h2 className="glance-h" id="h-glance">
                At a glance.
              </h2>{" "}
              {sum.join(" ")}
            </div>
            {(
              <>
                <ul className="toks">
                  {v.tiles.map((t) => (
                    <li key={t.id}>
                      <a
                        className={`tok s-${t.status}`}
                        href={`#t-${t.id}`}
                        aria-label={`${t.title}: ${ST[t.status].w}`}
                        onClick={(e) => {
                          e.preventDefault();
                          goTile(t.id);
                        }}
                      >
                        <span className="tok-w">
                          <Ic id={t.icon} />
                          <Mark st={t.status} />
                        </span>
                        <span className="tok-l" aria-hidden="true">
                          {t.short}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <ul className="legend" aria-label="What the marks mean">
                  {(["protect", "depends", "none"] as TileStatus[])
                    .filter((k) => counts[k])
                    .map((k) => (
                      <li key={k} className={`s-${k}`}>
                        <Mark st={k} />
                        {ST[k].w}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          <section className="today" aria-labelledby="h-today">
            <h2 className="sec-h" id="h-today">
              In effect today
            </h2>
            <ul className="trust" aria-label="About these answers">
              <li>
                <Ic id="i-quote" />
                Quoted from the law
              </li>
              <li>
                <Ic id="i-cal" />
                Law as of {v.asOfText}
              </li>
              <li>
                <Ic id="i-info" />
                Not legal advice
              </li>
            </ul>
            {GROUPS.map((g) => (
              <div className="grp" key={g.id}>
                <h3 className="grp-h">{g.title}</h3>
                <ul className="tiles">
                  {v.tiles
                    .filter((t) => t.group === g.id)
                    .map((t) => (
                      <li key={t.id}>
                        <TileView t={t} open={openTile === t.id} onToggle={() => setOpenTile(openTile === t.id ? null : t.id)} addressId={p.id} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="ahead" aria-labelledby="h-ahead">
            <Ahead id={p.id} v={v} onAlerts={openAlerts} log={p.changeLog} />
          </section>
        </div>
      </main>

      <footer className="foot">
        <div className="wrap">
          <h2>How HomeRule works</h2>
          <p>
            HomeRule reads housing laws once, turns them into dated rules, and checks each rule against this building’s facts. Every answer
            quotes the law and shows its date. When a fact is missing, it says so instead of guessing. When two rules may conflict, it shows
            both and flags it; it doesn’t decide.
          </p>
          <p className="fine">
            Not legal advice: HomeRule shows what published rules say, not how they apply to your own case.{" "}
            {DATA_SOURCE === "demo"
              ? "Demo data: hand-prepared from the challenge brief."
              : `Results from the HomeRule rule engine, law as of ${v.asOfText}.`}{" "}
            Quotes are verbatim excerpts from the source documents. Building facts come from public property records.
            {p.typed ? " This address is not one of our 500 samples: building facts are unknown." : ""} Contacts: phone numbers are not yet
            checked by us. Built at Hack-Nation 7 for the RealPage challenge.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- shared bar

/**
  The v3 sticky bar for pages that aren't the address page itself (the change log): logo, address search,
  "Get alerts" for that address, trust line. Same parts as the address page's bar, so it looks and works the same.
*/
export function StickyBar({
  street,
  current,
  index,
  asOfText,
  addressId,
}: {
  street: string;
  current: string;
  index: PageProps["index"];
  asOfText: string;
  /** The address the alert form signs up for; defaults to the last path segment (/changes/<id>). */
  addressId?: string;
}) {
  const [alerts, setAlerts] = useState(false);
  const path = usePathname();
  const id = addressId ?? decodeURIComponent(path?.split("/").filter(Boolean).pop() ?? "");
  const logo = (
    <Link className="logo" href="/">
      <span className="logo-mark">
        <BrandMark />
      </span>
      HomeRule
    </Link>
  );
  return (
    <>
      <Sprite />
      <div className="brandrow wrap">
        {logo}
        <span className="brand-r">
          <span className="nla">Not legal advice</span>
          <SourcePill />
        </span>
      </div>
      <header className="bar">
        <div className="bar-in wrap">
          {logo}
          <SearchField current={current} index={index} />
          <Alerts id={id} street={street} open={alerts} setOpen={setAlerts} />
          <div className="bar-trust">
            <SourcePill />
            <span className="nla2">Not legal advice · Law as of {asOfText}</span>
          </div>
        </div>
      </header>
    </>
  );
}
