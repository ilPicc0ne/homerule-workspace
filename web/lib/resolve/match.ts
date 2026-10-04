// Autocomplete matching for the /where search box. No data imports, so the client bundle only gets
// this function; the suggestion list itself (lib/resolve/suggest.ts) comes in as a prop.
import { plain } from "./normalise.ts";

export type Suggestion = {
  kind: "address" | "place";
  /** What the list shows in bold: "3515 Fillmore St", "Dorchester". */
  label: string;
  /** Second line: "San Francisco, CA", "Part of Boston, MA". */
  detail: string;
  /** Text sent to /where?q= when picked; resolves without Census. */
  q: string;
  /** Sample address_id, for addresses. */
  id?: string;
  /** Search tokens, plain() words joined and wrapped in spaces: " 3515 fillmore st street … ". */
  t: string;
};

/**
 * Suggestions whose tokens start with every typed word (any order). Places before addresses unless the
 * text starts with a number, then labels starting with the typed text, then shorter labels.
 */
export function suggest(list: Suggestion[], text: string, limit = 8): Suggestion[] {
  const typed = plain(text);
  if (typed.length < 2) return [];
  const words = typed.split(" ");
  const placesFirst = !/^\d/.test(words[0]);

  const hits: { s: Suggestion; rank: number; i: number }[] = [];
  list.forEach((s, i) => {
    if (!words.every((w) => s.t.includes(` ${w}`))) return;
    const kind = placesFirst === (s.kind === "place") ? 0 : 1;
    const starts = plain(s.label).startsWith(typed) ? 0 : 1;
    hits.push({ s, rank: kind * 2 + starts, i });
  });
  hits.sort((a, b) => a.rank - b.rank || a.s.label.length - b.s.label.length || a.i - b.i);
  return hits.slice(0, limit).map((h) => h.s);
}
