"use client";

import { useAsOf } from "@/lib/as-of";
import { formatDate } from "@/lib/format";

export default function HeaderAsOf({ dates, fallback }: { dates: string[]; fallback: string | null }) {
  const asOf = useAsOf(dates, fallback ?? "");
  return <span>{asOf ? `As of ${formatDate(asOf)}` : "No data yet"}</span>;
}
