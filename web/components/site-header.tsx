import Link from "next/link";
import DataSourceToggle from "./data-source-toggle";
import HeaderAsOf from "./header-as-of";
import { icons } from "./icons";

export default function SiteHeader({ dates, fallback }: { dates: string[]; fallback: string | null }) {
  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <Link href="/" className="brand">
          <span className="brand-mark">{icons.home}</span>
          HomeRule
        </Link>
        <div className="header-meta">
          <DataSourceToggle />
          <p className="header-legal">
            <span>Not legal advice</span>
            <HeaderAsOf dates={dates} fallback={fallback} />
          </p>
        </div>
      </div>
    </header>
  );
}
