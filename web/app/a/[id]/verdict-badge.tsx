import type { Badge } from "@/lib/changes/impact.ts";

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
