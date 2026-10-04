import { PROTOTYPE_NOTICE } from "@/lib/alerts/disclaimer";
import "./prototype-banner.css";

/** The site-wide prototype notice: top of every page, not dismissible. Same text as every email footer. */
export default function PrototypeBanner() {
  return (
    <div className="proto-banner" role="note" aria-label="About this site">
      <p>{PROTOTYPE_NOTICE}</p>
    </div>
  );
}
