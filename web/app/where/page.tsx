import type { Metadata } from "next";
import Link from "next/link";
import { icons } from "../icons";
import { resolveQuery } from "@/lib/resolve/resolve.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";
import { SUGGESTIONS } from "@/lib/resolve/suggest.ts";
import type { AddressResult, Coverage, ResolveResult, TreeLevel } from "@/lib/resolve/types.ts";
import SearchBox from "./search-box";
import s from "./where.module.css";

/*
  /where: type any US address (or a city, neighbourhood, county, state) and see its legal
  jurisdiction tree, each level marked "rules in HomeRule" or "not covered". Server-rendered from
  ?q=, so a plain GET form works without client JS and every result has a shareable URL.
*/

export const metadata: Metadata = {
  title: "Where is this? · HomeRule",
  description: "Which governments make the housing rules at an address: federal, state, county, city. Not legal advice.",
};

const EXAMPLES = [
  "471 Columbia Rd, Dorchester, MA",
  "4801 E 3rd St, Los Angeles, CA 90022",
  "333 Washington St, Brookline, MA",
  "20 Civic Center Plaza, Santa Ana, CA",
  "350 5th Ave, New York, NY",
  "Hoboken, NJ",
];

const COVERAGE: Record<Coverage, string> = {
  covered: "HomeRule has local and state rules for this place.",
  state_only: "HomeRule has the state's rules here, but not this place's local rules.",
  not_covered: "Not covered: HomeRule has law for 3 states and 10 cities.",
};

function Tree({ tree }: { tree: TreeLevel[] }) {
  return (
    <ol className={s.tree} aria-label="Jurisdictions, from the top down">
      {tree.map((l, i) => (
        <li key={`${l.level}-${l.geoid ?? l.name}-${i}`} className={s.level}>
          <span className={s.dot} data-covered={l.covered} aria-hidden="true" />
          <div className={s.levelBody}>
            <span className={s.levelLabel}>{l.label}</span>
            <span className={s.levelName}>{l.name}</span>
            {l.note && <span className={s.levelNote}>{l.note}</span>}
          </div>
          <span className={l.covered ? s.badgeOn : s.badgeOff}>{l.covered ? "Rules in HomeRule" : "Not covered"}</span>
        </li>
      ))}
    </ol>
  );
}

const fmtRange = (r: { min: number; max: number | null }) => (r.max === null ? `${r.min} or more` : r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

function Facts({ sample }: { sample: NonNullable<AddressResult["sample"]> }) {
  const f = sample.facts;
  const rows: [string, string, string][] = [
    ["Year built", f.built ? f.built.from.slice(0, 4) : "Unknown", sample.source.built === "csv" ? "property record" : "not in the data"],
    ["Units", f.units ? fmtRange(f.units) : "Unknown", sample.source.units === "csv" ? "property record" : sample.source.units === "use_code" ? "from the use code" : "not in the data"],
    ["Use", f.use_class ? f.use_class.replace(/_/g, " ") : "Unknown", sample.source.use_class === "use_code" ? "from the use code" : "not in the data"],
    ["Owner type", "Unknown", "never in the data"],
  ];
  return (
    <section className={s.facts} aria-labelledby="facts-title">
      <h2 id="facts-title">Building facts</h2>
      <dl>
        {rows.map(([k, v, src]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <strong data-unknown={v === "Unknown"}>{v}</strong> <span>{src}</span>
            </dd>
          </div>
        ))}
      </dl>
      {sample.review.length > 0 && <p className={s.small}>Flagged for review: {sample.review.join("; ")}</p>}
      <p className={s.small}>
        Sample address {sample.address_id}, data retrieved {sample.retrieved_at.slice(0, 10)}.
      </p>
    </section>
  );
}

function Result({ r }: { r: ResolveResult }) {
  if (r.kind === "not_found" || r.kind === "unavailable") {
    return (
      <div className={s.card} role="status">
        <p className={s.lead}>{r.kind === "unavailable" ? "Try again in a minute" : "Nothing found"}</p>
        <p>{r.message}</p>
        {r.kind === "not_found" && r.suggestion && (
          <p>
            Try <Link href={`/where?q=${encodeURIComponent(r.suggestion)}`}>{r.suggestion}</Link>.
          </p>
        )}
      </div>
    );
  }
  if (r.kind === "ambiguous") {
    return (
      <div className={s.card}>
        <p className={s.lead}>Which one?</p>
        <p>{r.message}</p>
        <ul className={s.candidates}>
          {r.candidates.map((c) => (
            <li key={c.matched_address}>
              <Link href={`/where?q=${encodeURIComponent(c.matched_address)}`}>{c.matched_address}</Link>
              <span>
                {c.municipality}, {c.state}
                {c.covered ? "" : " · not covered"}
              </span>
            </li>
          ))}
        </ul>
        {r.total > r.candidates.length && <p className={s.small}>Showing {r.candidates.length} of {r.total} matches.</p>}
      </div>
    );
  }
  return (
    <div className={s.card}>
      <p className={s.where}>
        <span className={s.pin}>{icons.pin}</span>
        {r.kind === "address" ? r.matched_address : r.matched.text}
      </p>
      <p className={s.lead} data-coverage={r.coverage}>
        {COVERAGE[r.coverage]}
      </p>
      {r.kind === "address" && r.warnings.map((w) => <p key={w} className={s.warning}>{w}</p>)}
      {r.notes.map((n) => (
        <p key={n} className={s.note}>
          {n}
        </p>
      ))}
      <Tree tree={r.tree} />
      {r.kind === "place" && r.children.length > 0 && (
        <p className={s.small}>
          Cities in HomeRule here:{" "}
          {r.children.map((c, i) => (
            <span key={c.id}>
              {i > 0 && " · "}
              <Link href={`/where?q=${encodeURIComponent(c.name)}`}>{c.name}</Link>
            </span>
          ))}
        </p>
      )}
      {r.kind === "address" && r.sample && <Facts sample={r.sample} />}
    </div>
  );
}

export default async function WherePage({ searchParams }: PageProps<"/where">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 200) ?? "";
  const result = q ? await resolveQuery(q, { fetch, samples: sampleIndex() }) : null;
  const asOf = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="wrap top">
        <Link href="/" className="brand">
          <span className="brand-mark">{icons.home}</span>
          HomeRule
        </Link>
      </header>
      <main className={`wrap ${s.main}`}>
        <h1 className={s.title}>Who makes the rules at your address?</h1>
        <p className={s.sub}>Federal, state, county and city: see which levels govern a place, and which of them HomeRule covers.</p>

        <div className={s.form}>
          <SearchBox key={q} defaultValue={q} suggestions={SUGGESTIONS} />
          <p className={s.hint}>Suggestions from HomeRule&apos;s sample addresses and places; any other US address works too, press Enter.</p>
        </div>

        {result ? (
          <Result r={result} />
        ) : (
          <div className={s.examples}>
            <p>Try one:</p>
            <ul>
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <Link href={`/where?q=${encodeURIComponent(e)}`}>{e}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <footer className="wrap footer">
        <p>Not legal advice. Shows which governments may make housing rules for a place. As of {asOf}.</p>
        <p>Jurisdictions from the US Census geocoder; postal city names don&apos;t decide which city&apos;s law applies.</p>
      </footer>
    </>
  );
}
