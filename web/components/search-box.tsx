"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { resolve, suggest, type Resolution, type SearchIndex, type Suggestion } from "@/lib/demo-search";
import { icons } from "./icons";

/*
  One search box for every level: a demo address opens its page; a city, neighbourhood,
  county or state opens its jurisdiction page; a sample address without a demo page
  points to its city; anything else is "not covered". Runs in the browser, no network.
*/

type Miss =
  | { kind: "not_covered"; query: string }
  | { kind: "unmatched_address"; query: string; placeId?: string; placeName?: string }
  | { kind: "sample"; street: string; cityId: string; cityName: string };

export default function SearchBox({ index }: { index: SearchIndex }) {
  const id = useId();
  const listId = `${id}-list`;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [miss, setMiss] = useState<Miss | null>(null);

  const matches = useMemo(() => suggest(query, index), [query, index]);
  const showList = open && matches.length > 0;
  // A street address (starts with a house number) that matches none of the samples: say so while typing.
  const noSample = open && !miss && matches.length === 0 && /^\d+\s+\S{2,}/.test(query.trim());
  const cityName = (cityId: string) => index.places.find((p) => p.id === cityId)?.label ?? cityId;

  function go(target: Suggestion) {
    setOpen(false);
    if (target.kind === "address") {
      setQuery(`${target.label}, ${target.sub}`);
      if (target.demo) router.push(`/a/${target.id}`);
      else setMiss({ kind: "sample", street: target.label, cityId: target.cityId, cityName: cityName(target.cityId) });
      return;
    }
    setQuery(target.via ?? target.label);
    router.push(target.via ? `/j/${target.id}?via=${encodeURIComponent(target.via)}` : `/j/${target.id}`);
  }

  function handle(r: Resolution) {
    setOpen(false);
    if (r.kind === "empty") return;
    if (r.kind === "not_covered") setMiss({ kind: "not_covered", query: r.query });
    else if (r.kind === "unmatched_address")
      setMiss({ kind: "unmatched_address", query: r.query, placeId: r.place?.id, placeName: r.place?.label });
    else if (r.kind === "place") go({ ...r.entry, via: r.via });
    else go(r.entry);
  }

  function submit() {
    if (showList) return go(matches[Math.min(active, matches.length - 1)]);
    handle(resolve(query, index));
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const step = ev.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      submit();
    } else if (ev.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="finder">
      <form
        className="search"
        role="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        {icons.pin}
        <label htmlFor={`${id}-input`} className="sr-only">
          Address, city, neighbourhood, county or state
        </label>
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder="Address, city or neighbourhood"
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
        <button type="submit" className="search-go" aria-label="Look up">
          {icons.search}
        </button>
      </form>

      <ul id={listId} role="listbox" aria-label="Suggestions" className="suggest" hidden={!showList}>
        {matches.map((m, i) => (
          <li
            key={`${m.kind}-${m.id}`}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            className="suggest-item"
            // mousedown picks before the input loses focus and closes the list
            onMouseDown={(ev) => {
              ev.preventDefault();
              go(m);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className="suggest-main">
              <strong>{m.label}</strong>
              <span>{m.via ? `${m.via} is part of ${m.label}` : m.sub}</span>
            </span>
            <span className="suggest-kind">
              {m.kind === "address" ? (m.demo ? "Address" : "Sample address") : m.sub.split(",")[0]}
            </span>
          </li>
        ))}
        {matches.some((m) => m.kind === "address") && (
          <li className="suggest-foot" role="presentation">
            Full answers for our 500 sample addresses only.
          </li>
        )}
      </ul>
      {noSample && (
        <p className="suggest suggest-none">
          Not one of our 500 sample addresses. Press Enter and we&rsquo;ll point you to its city&rsquo;s rules where we have them.
        </p>
      )}

      <p className="search-status" role="status">
        {miss?.kind === "not_covered" && (
          <>Not covered: HomeRule has law for 3 states and 10 cities. &ldquo;{miss.query}&rdquo; isn&rsquo;t one of them yet.</>
        )}
        {miss?.kind === "unmatched_address" && (
          <>
            &ldquo;{miss.query}&rdquo; isn&rsquo;t one of our 500 sample addresses.{" "}
            {miss.placeId ? (
              <>
                See the law for <Link href={`/j/${miss.placeId}`}>{miss.placeName}</Link>.
              </>
            ) : (
              <>Try a city or neighbourhood, or one of the examples below. HomeRule covers 3 states and 10 cities.</>
            )}
          </>
        )}
        {miss?.kind === "sample" && (
          <>
            {miss.street} is in our sample, but its page comes with the rule engine. See the law for{" "}
            <Link href={`/j/${miss.cityId}`}>{miss.cityName}</Link>.
          </>
        )}
      </p>
    </div>
  );
}
