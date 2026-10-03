import { DATA_SOURCE, DATA_SOURCE_LABEL, type DataSource } from "@/lib/config";

/*
  Shows which data this build serves. One build = one source (NEXT_PUBLIC_DATA_SOURCE),
  so the inactive option is shown but disabled, with a hint.
*/
const HINT: Record<DataSource, string> = {
  demo: "Demo data: hand-prepared from the challenge brief",
  live: "Live data arrives with the rule engine",
};

export default function DataSourceToggle() {
  const options: DataSource[] = ["demo", "live"];
  return (
    <div className="seg" role="group" aria-label="Data source">
      {options.map((opt) => {
        const active = opt === DATA_SOURCE;
        return (
          <button
            key={opt}
            type="button"
            className="seg-item"
            aria-pressed={active}
            aria-disabled={!active}
            aria-describedby={active ? undefined : `seg-hint-${opt}`}
          >
            {DATA_SOURCE_LABEL[opt]}
            <span className="seg-hint" role="tooltip" id={`seg-hint-${opt}`}>
              {active ? `Showing ${DATA_SOURCE_LABEL[opt].toLowerCase()}` : HINT[opt]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
