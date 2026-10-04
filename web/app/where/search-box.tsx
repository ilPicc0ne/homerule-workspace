"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import { suggest, type Suggestion } from "@/lib/resolve/match.ts";
import { icons } from "../icons";

/*
  The /where search box: a combobox over HomeRule's own sample addresses and places (the list comes
  from lib/resolve/suggest.ts as a prop; nothing is fetched while typing). Picking a suggestion goes to
  /where?q=…; any other text is submitted as typed. Without JS it is a plain GET form.
*/

export default function SearchBox({ defaultValue, suggestions }: { defaultValue: string; suggestions: Suggestion[] }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches = open ? suggest(suggestions, query) : [];
  const showList = matches.length > 0;

  function go(q: string) {
    setOpen(false);
    setActive(-1);
    router.push(`/where?q=${encodeURIComponent(q)}`);
  }

  function pick(s: Suggestion) {
    setQuery(s.q);
    go(s.q);
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!matches.length) return;
      const step = ev.key === "ArrowDown" ? 1 : -1;
      // -1 = back in the text field, nothing highlighted.
      setActive((a) => {
        const n = a + step;
        return n < -1 ? matches.length - 1 : n >= matches.length ? -1 : n;
      });
    } else if (ev.key === "Enter") {
      if (showList && active >= 0 && matches[active]) {
        ev.preventDefault();
        pick(matches[active]);
      }
      // Otherwise the form submits the typed text.
    } else if (ev.key === "Escape") {
      if (showList) ev.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form
      action="/where"
      method="get"
      role="search"
      className="combo"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (query.trim()) go(query.trim());
      }}
    >
      <div className="search">
        {icons.search}
        <label htmlFor={`${id}-input`} className="sr-only">
          Address or place
        </label>
        <input
          id={`${id}-input`}
          name="q"
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder="Street address, city, neighbourhood or state"
          maxLength={200}
          value={query}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          onChange={(ev) => {
            setQuery(ev.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="search-go" aria-label="Look up">
          {icons.search}
        </button>
      </div>

      <ul id={listId} role="listbox" aria-label="Suggestions" className="suggest" hidden={!showList}>
        {matches.map((s, i) => (
          <li
            key={s.q}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            className="suggest-item"
            // mousedown picks before the input loses focus and closes the list
            onMouseDown={(ev) => {
              ev.preventDefault();
              pick(s);
            }}
            onMouseEnter={() => setActive(i)}
          >
            {s.kind === "address" ? icons.home : icons.pin}
            <span>
              <strong>{s.label}</strong> {s.detail}
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}
