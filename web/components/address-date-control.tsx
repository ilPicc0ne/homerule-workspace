"use client";

import { useId, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dateDay, dayDate, validAsOf, MIN_DATE, MAX_DATE, type DateControls } from "@/lib/address-dates";
import styles from "./address-date-control.module.css";

/** Local draft while dragging; calculate on release, keyboard step or explicit date submit. */
export default function AddressDateControl({ config, unavailable = false }: { config: DateControls; unavailable?: boolean }) {
  const [dateState, setDateState] = useState({ selected: config.selected, draft: config.selected });
  // Keep the same input element (and keyboard focus) as server answers change.
  if (dateState.selected !== config.selected)
    setDateState({ selected: config.selected, draft: config.selected });
  const draft = dateState.selected === config.selected ? dateState.draft : config.selected;
  const setDraft = (value: string) => setDateState({ selected: config.selected, draft: value });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const min = [config.selected, `${Number(config.baseline.slice(0, 4)) - 1}-01-01`].sort()[0];
  const max = [config.selected, `${Number(config.baseline.slice(0, 4)) + 4}-12-31`].sort().at(-1)!;
  const previous = config.events.filter(d => d < config.selected).at(-1);
  const next = config.events.find(d => d > config.selected);
  const go = (date: string) => {
    if (pending || !validAsOf(date)) return;
    setDraft(date);
    const query = new URLSearchParams(params.toString());
    query.set("as_of", date);
    startTransition(() => {
      if (date === config.selected) router.refresh();
      else router.push(`${pathname}?${query}`, { scroll: false });
    });
  };
  return <section className={styles.control} aria-label="Explore rules by date" aria-busy={pending}>
    <div className={styles.heading}>
      <div><h2>Explore the law over time</h2><p>Choose a day to update all six answers and the changes below.</p></div>
      <form onSubmit={e => { e.preventDefault(); go(String(new FormData(e.currentTarget).get("as_of"))); }} className={styles.form}>
        <label htmlFor={`${id}-date`}>Law as of</label>
        <input id={`${id}-date`} type="date" name="as_of" required min={MIN_DATE} max={MAX_DATE} value={draft}
          onInput={e => setDraft(e.currentTarget.value)} onChange={e => setDraft(e.target.value)} disabled={pending} />
        <button className={styles.button} type="submit" disabled={pending || !validAsOf(draft)}>Show date</button>
      </form>
    </div>
    <label htmlFor={`${id}-slider`} className={styles.sliderLabel}>Timeline <span>{draft || config.selected}</span></label>
    <input id={`${id}-slider`} aria-label="Date timeline" type="range" min={dateDay(min)} max={dateDay(max)} step="1"
      value={dateDay(validAsOf(draft) ? draft : config.selected)} aria-disabled={pending} aria-valuetext={draft}
      onChange={e => { if (!pending) setDraft(dayDate(Number(e.target.value))); }}
      onPointerUp={e => go(dayDate(Number(e.currentTarget.value)))}
      onKeyUp={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) go(dayDate(Number(e.currentTarget.value))); }} />
    <div className={styles.bounds}><span>{min}</span><span>{max}</span></div>
    <div className={styles.actions}>
      <button className={styles.button} disabled={pending || !previous} onClick={() => previous && go(previous)}>Previous change{previous ? ` · ${previous}` : ""}</button>
      <button className={styles.button} disabled={pending} onClick={() => go(config.baseline)}>Dataset date · {config.baseline}</button>
      <button className={styles.button} disabled={pending || !next} onClick={() => next && go(next)}>Next change{next ? ` · ${next}` : ""}</button>
    </div>
    <p role="status" aria-live="polite" className={styles.status}>{pending ? `Updating answers for ${draft}…${unavailable ? "" : ` Answers below still show ${config.selected}.`}` : draft !== config.selected ? `Date selected: ${draft || "choose a date"}. Release the slider or select Show date.` : unavailable ? `Selected date: ${config.selected}. Answers are unavailable.` : `Showing answers for ${config.selected}.`}</p>
    <p className={styles.note}>Uses the laws and building facts in our dataset, retrieved {config.retrieved}. Future dates show scheduled changes; later amendments and changes to the building may be missing. Not legal advice.</p>
  </section>;
}
