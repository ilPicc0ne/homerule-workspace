"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { icons } from "./icons";

/*
  Client-side preview of the address flow. Five hard-coded example addresses,
  no network, no storage. The alerts step only appears once an address is found,
  and its button only shows a local message: nothing is sent or kept.
*/

type Outcome = "applies" | "unknown" | "none" | "coming";

type Example = {
  street: string;
  short: string;
  city: string;
  state: string;
  question: string;
  outcome: Outcome;
  answer: string;
  detail: string;
};

// Answers follow the PRD journeys (docs/PRD.md J1–J4) and the sample address data.
const examples: Example[] = [
  {
    street: "3515 Fillmore St",
    short: "Fillmore St",
    city: "San Francisco",
    state: "CA",
    question: "How much can my rent go up?",
    outcome: "applies",
    answer: "Local rent control applies",
    detail: "San Francisco Rent Ordinance",
  },
  {
    street: "145 Taylor St",
    short: "Taylor St",
    city: "San Francisco",
    state: "CA",
    question: "How much can my rent go up?",
    outcome: "applies",
    answer: "The state rent cap applies",
    detail: "Built 2005, so the city cap doesn't cover it",
  },
  {
    street: "10635 Sherman Grove Ave",
    short: "Sherman Grove Ave",
    city: "Los Angeles",
    state: "CA",
    question: "How much can my rent go up?",
    outcome: "unknown",
    answer: "Depends on one date",
    detail: "Check the certificate of occupancy with LA Housing",
  },
  {
    street: "327 Jackson St",
    short: "Jackson St",
    city: "Hoboken",
    state: "NJ",
    question: "Can software set my rent?",
    outcome: "coming",
    answer: "A state rule starts 01.07.2027",
    detail: "Hoboken already has its own rule",
  },
  {
    street: "134 Oxford St",
    short: "Oxford St",
    city: "Cambridge",
    state: "MA",
    question: "How much can my rent go up?",
    outcome: "none",
    answer: "No rent cap in force",
    detail: "Massachusetts has no rent control today",
  },
];

const coveredPlaces =
  /\b(ca|nj|ma|california|new jersey|massachusetts|los angeles|san francisco|san diego|berkeley|santa ana|jersey city|hoboken|newark|boston|cambridge)\b/i;

const outcomeIcon: Record<Outcome, ReactNode> = {
  applies: icons.check,
  unknown: icons.unsure,
  none: icons.dash,
  coming: icons.calendar,
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fullLabel = (e: Example) => `${e.street}, ${e.city} ${e.state}`;

function matchesFor(query: string) {
  const q = normalize(query);
  if (!q) return examples;
  return examples.filter((e) => normalize(fullLabel(e)).includes(q));
}

export default function AddressPreview() {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Example | null>(null);
  const [miss, setMiss] = useState<"soon" | "outside" | null>(null);
  const [email, setEmail] = useState("");
  const [alertNote, setAlertNote] = useState(false);

  const matches = matchesFor(query);
  const showList = open && matches.length > 0;

  function pick(e: Example) {
    setQuery(fullLabel(e));
    setFound(e);
    setMiss(null);
    setOpen(false);
    setAlertNote(false);
  }

  function lookUp() {
    const m = matchesFor(query);
    if (query.trim() && m.length > 0) {
      pick(m[Math.min(active, m.length - 1)]);
      return;
    }
    setOpen(false);
    setFound(null);
    if (!query.trim()) return;
    // Only a comma ("street, place") names the place clearly enough to judge coverage.
    const namesPlace = query.includes(",");
    setMiss(namesPlace && !coveredPlaces.test(query) ? "outside" : "soon");
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const step = ev.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (showList) pick(matches[Math.min(active, matches.length - 1)]);
      else lookUp();
    } else if (ev.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Your rights as a renter, for your exact address.</h1>
        <p className="hero-sub">See which housing rules apply to your home, today and next.</p>

        <div className="finder">
          <p className="preview-tag">Preview — full search coming soon</p>
          <div className="combo">
          <div className="search">
            {icons.pin}
            <label htmlFor={`${id}-input`} className="sr-only">
              Your address
            </label>
            <input
              id={`${id}-input`}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              placeholder="Enter your address"
              value={query}
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList ? `${id}-opt-${active}` : undefined}
              onChange={(ev) => {
                setQuery(ev.target.value);
                setActive(0);
                setOpen(true);
                setMiss(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
            />
            <button type="button" className="search-go" onClick={lookUp} aria-label="Look up address">
              {icons.search}
            </button>
          </div>

          <ul id={listId} role="listbox" aria-label="Example addresses" className="suggest" hidden={!showList}>
            {matches.map((e, i) => (
              <li
                key={e.street}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className="suggest-item"
                // mousedown picks before the input loses focus and closes the list
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(e);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {icons.pin}
                <span>
                  <strong>{e.street}</strong> {e.city} {e.state}
                </span>
              </li>
            ))}
          </ul>
          </div>

          <p className="search-status" role="status">
            {miss === "soon" && "Coming soon for every address in our 10 cities."}
            {miss === "outside" && "Not covered yet. We start with California, New Jersey and Massachusetts."}
          </p>
        </div>

        <p className="fine">Not legal advice.</p>
      </section>

      <div className="result" aria-live="polite">
        {found ? (
          <>
            <article className="example" key={found.street} aria-label={`Example answer for ${found.street}`}>
              <div className="example-head">
                <p className="example-where">
                  {icons.pin}
                  <span>
                    {found.street}, {found.city}
                  </span>
                </p>
                <span className="tag">Example</span>
              </div>
              <h2 className="example-q">{found.question}</h2>
              <div className={`answer answer-${found.outcome}`}>
                <span className="answer-icon">{outcomeIcon[found.outcome]}</span>
                <p>
                  <strong>{found.answer}</strong>
                  <span>{found.detail}</span>
                </p>
              </div>
              <p className="example-meta">
                {icons.quote}
                <span>
                  Quoted from the law · as of <time dateTime="2026-10-01">01.10.2026</time>
                </span>
              </p>
            </article>

            <div className="alert-step" key={`alerts-${found.street}`}>
              <h2 className="alert-title">
                {icons.bell}
                Get updates for this address
              </h2>
              <div className="alert-row">
                <label htmlFor={`${id}-email`} className="sr-only">
                  Email (preview, nothing is sent)
                </label>
                <input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="off"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      setAlertNote(true);
                    }
                  }}
                />
                <button type="button" onClick={() => setAlertNote(true)}>
                  Notify me
                </button>
              </div>
              <p className="alert-note" role="status">
                {alertNote && "Alerts are coming soon. We'll launch them with double opt-in."}
              </p>
            </div>
          </>
        ) : (
          <div className="try">
            <p className="try-title">Try an example</p>
            <ul className="try-list">
              {examples.map((e) => (
                <li key={e.street}>
                  <button type="button" className="try-chip" onClick={() => pick(e)}>
                    {e.short}
                    <span>{e.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
