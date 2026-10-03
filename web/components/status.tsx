import { RESULT_WORDS } from "@/lib/law";
import type { ResultValue } from "@/lib/types";

export type DotKind = ResultValue | "none" | "area";

export function Dot({ kind, label }: { kind: DotKind; label?: string }) {
  return <span className={`dot dot-${kind}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function ResultBadge({ value }: { value: ResultValue }) {
  return (
    <span className={`word-${value}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
      <Dot kind={value} />
      {RESULT_WORDS[value]}
    </span>
  );
}
