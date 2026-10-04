import type { Badge } from "@/lib/changes/impact.ts";
import { Ic } from "./sprite";

/*
  The renter-impact badge of one change (lib/changes/impact.ts maps the engine's verdict; nothing is decided here).
  Arrow + text, never colour alone; the screen-reader text and the tooltip add "Your unit may differ.".
  The data's one-line summary shows under it only when it passed the lint, as "Summary · see the law text".
*/
export function VerdictBadge({ b, lawHref }: { b: Badge; lawHref?: string | null }) {
  return (
    <>
      <p className={`vb ${b.kind}`} title={b.label}>
        <span aria-hidden="true" className="vb-a">
          {b.arrow}
        </span>
        <span aria-hidden="true">{b.text}</span>
        <span className="sr">{b.label}</span>
      </p>
      {b.why && (
        <p className="vb-why">
          Summary: {b.why}
          {lawHref && (
            <>
              {" · "}
              <a href={lawHref}>see the law text</a>
            </>
          )}
        </p>
      )}
    </>
  );
}

/*
  History-column pieces (address page, change log). All take the badge as mapped in lib/changes/impact.ts.
  - VerdictMark: the timeline marker (green ↑, red ↓, grey filled circle for depends / conflict). Decorative: the
    label next to it carries the meaning in words.
  - VerdictLabel: arrow + short text, coloured; screen readers get the full label with "Your unit may differ.".
  - TopicChip: one of the six topics, with its icon.
*/
export function VerdictMark({ b, className = "" }: { b: Badge; className?: string }) {
  return (
    <span aria-hidden="true" className={`vm ${b.kind} ${className}`}>
      {b.kind === "unclear" ? "" : b.arrow}
    </span>
  );
}

export function VerdictLabel({ b }: { b: Badge }) {
  return (
    <span className={`vl ${b.kind}`} title={b.label}>
      {b.kind !== "unclear" && (
        <span aria-hidden="true" className="vl-a">
          {b.arrow}
        </span>
      )}
      <span aria-hidden="true">{b.short}</span>
      <span className="sr">{b.label}</span>
    </span>
  );
}

export function TopicChip({ title, icon }: { title: string; icon: string }) {
  return (
    <span className="tchip">
      <Ic id={icon} />
      {title}
    </span>
  );
}

/** One line at the top of the history column, shown when at least one entry carries a verdict. */
export function VerdictLegend() {
  return (
    <p className="vlegend">
      <span className="sr">Markers: </span>
      <span>
        <span aria-hidden="true" className="vm adds sm">↑</span> adds protection
      </span>
      <span aria-hidden="true" className="vsep">·</span>
      <span>
        <span aria-hidden="true" className="vm narrows sm">↓</span> narrows protection
      </span>
      <span aria-hidden="true" className="vsep">·</span>
      <span>
        <span aria-hidden="true" className="vm unclear sm" /> depends on a fact
      </span>
    </p>
  );
}
