"use client";

import { setAsOf, useAsOf } from "@/lib/as-of";
import { formatDate } from "@/lib/format";

/*
  The as-of picker: a law has an effective date, so the date is the main control.
  Snaps to the published list of dates; the choice lives in ?as_of=.
*/
type Stop = { date: string; label: string };

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AsOfTimeline({
  stops,
  fallback,
  retrieved,
  title = "As of",
}: {
  stops: Stop[];
  fallback: string;
  retrieved: string;
  title?: string;
}) {
  const dates = stops.map((s) => s.date);
  const asOf = useAsOf(dates, fallback);
  const current = stops.find((s) => s.date === asOf);
  const future = asOf > retrieved;

  return (
    <div className="timeline">
      <div className="timeline-head">
        <p className="timeline-date" aria-live="polite">
          {title} {formatDate(asOf)}
          {current && <span>{current.label}</span>}
        </p>
      </div>
      <div className="timeline-track" style={{ ["--stops" as string]: stops.length }} role="group" aria-label="Choose the date">
        {stops.map((s) => {
          const [y, m, d] = s.date.split("-");
          return (
            <button
              key={s.date}
              type="button"
              className="stop"
              aria-pressed={s.date === asOf}
              aria-label={`${formatDate(s.date)}: ${s.label}`}
              onClick={() => setAsOf(s.date, fallback)}
            >
              <span className="stop-dot" />
              <span className="stop-day">
                {SHORT[Number(m) - 1]} {Number(d)}
              </span>
              <span className="stop-year">{y}</span>
            </button>
          );
        })}
      </div>
      <p className="timeline-note">
        {future
          ? `A future date applies the law as published by ${formatDate(retrieved)}. Bills can still change.`
          : `Sources retrieved ${formatDate(retrieved)}.`}
      </p>
    </div>
  );
}
