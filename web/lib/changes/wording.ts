// Plain-language words for the change log and the alert email. A status in words, never a verdict:
// no advice, no "compliant" or "illegal".
import type { Change, Entry, Result } from "./types.ts";

export const RESULT_WORDS: Record<Result, string> = {
  applies: "Applies",
  unknown: "May apply (unknown: a building fact decides)",
  superseded: "Replaced here by a local rule",
  not_yet_effective: "Enacted, not yet in effect",
  pending: "Proposed, not law",
};

export const NOT_LISTED = "Not listed for this address";

export function resultWords(side: Change["before"]): string {
  return side ? RESULT_WORDS[side.result] : NOT_LISTED;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

/** 2027-07-01 -> "July 1, 2027". */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "date not stated";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** One line on what changed: "Enacted, not yet in effect → Applies". */
export function changeLine(c: Change): string {
  const parts: string[] = [];
  if (c.result_changed || c.change !== "changed") parts.push(`${resultWords(c.before)} → ${resultWords(c.after)}`);
  if (c.conflict_flag_changed) {
    parts.push(c.after?.conflict_flag ? "now flagged: may conflict with another rule, not decided" : "conflict flag removed");
  } else if (c.after?.conflict_flag) {
    parts.push("still flagged: may conflict with another rule, not decided");
  }
  return parts.join("; ");
}

/** When the entry's change is seen: the later as-of date for a date comparison, the as-of date for an ingest. */
export function entryHeading(e: Entry): string {
  if (e.kind === "ingest") return `New document checked against this address, as of ${longDate(e.after_as_of)}`;
  return `Between ${longDate(e.before_as_of)} and ${longDate(e.after_as_of)}`;
}

/** The rule name to show: its title, else its citation, else its ID. */
export function ruleName(c: Change): string {
  return c.title || c.citation || c.team_rule_id;
}

/** The entry an alert email would be about: a new document first, else the change coming up from the as-of date. */
export function featuredEntry(entries: Entry[], asOf: string): Entry | null {
  return entries.find((e) => e.kind === "ingest") ?? entries.find((e) => e.before_as_of === asOf) ?? entries[0] ?? null;
}
