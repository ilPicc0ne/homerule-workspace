import { PROTOTYPE_NOTICE } from "@/lib/alerts/disclaimer";
import "./prototype-banner.css";

const BOLD_TAIL = "Not legal advice.";

/** The site-wide prototype notice: top of every page, not dismissible. Same text as every email footer. */
export default function PrototypeBanner() {
  const lead = PROTOTYPE_NOTICE.endsWith(BOLD_TAIL)
    ? PROTOTYPE_NOTICE.slice(0, -BOLD_TAIL.length)
    : PROTOTYPE_NOTICE;
  const tail = lead === PROTOTYPE_NOTICE ? null : BOLD_TAIL;
  return (
    <div className="proto-banner" role="note" aria-label="About this site">
      <p>
        <svg className="proto-banner-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9.25" />
          <path d="M12 11v5.5" />
          <circle cx="12" cy="7.75" r="0.6" className="dot" />
        </svg>
        <span>
          {lead}
          {tail && <strong>{tail}</strong>}
        </span>
      </p>
    </div>
  );
}
