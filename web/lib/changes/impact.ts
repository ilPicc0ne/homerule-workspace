// Renter impact of one change, shown as a badge: "This change adds / narrows renter protection".
// The verdict is computed by the engine (engine/score.py annotate_changes, from the topic level at this address
// before vs after), never here: this file only MAPS it to a badge and never guesses one. "unchanged" -> the neutral
// "= No change in protection here" badge (another rule already covers the home, #117), apart from the grey "depends".
// No verdict or a pending bill (not law) -> no badge.
import type { AddressChanges, Change } from "./types.ts";
import { formatDate } from "../format.ts";

export type Verdict = "better" | "worse" | "unchanged" | "unclear";

/** What the engine writes on each diff change (`renter_impact`); `why` is optional data, shown only if it passes the lint. */
export type RenterImpact = {
  verdict: Verdict;
  topic?: string;
  level_before?: string;
  level_after?: string;
  why?: string | null;
};

export type BadgeKind = "adds" | "narrows" | "unclear" | "same";

export type Badge = {
  kind: BadgeKind;
  /** Always shown next to the text: never colour alone. */
  arrow: "↑" | "↓" | "?" | "=";
  text: string;
  /** aria-label and tooltip: the text plus "Your unit may differ." */
  label: string;
  /** The data's one-line summary, only when it passes `whyOk`; else null (badge alone). */
  why: string | null;
};

/**
 * Page badges (history column, change log): on since the verdict integration (#59 + #110 build, #71/#72/#77, 04.10.2026);
 * Silvan hand-checks 15 random badges against their quotes (web/scripts/verdict-split.ts) before production. The email mapping is on regardless:
 * it shows nothing until the synced diff carries `renter_impact`.
 */
export const PAGE_BADGES = true;

export const UNIT_MAY_DIFFER = "Your unit may differ.";

export const BADGE_TEXT: Record<BadgeKind | "unclear_conflict", string> = {
  adds: "This change adds renter protection",
  narrows: "This change narrows renter protection",
  unclear: "Depends on a fact we don't have",
  same: "No change in protection here",
  unclear_conflict: "May conflict with another rule, not decided",
};

const ARROW: Record<BadgeKind, Badge["arrow"]> = { adds: "↑", narrows: "↓", unclear: "?", same: "=" };

/** Words a shown summary may never contain (advice, verdicts on the reader's case). */
export const BANNED = /\b(you|your|yours|illegal|compliant|must|should|recommend|advise)\b/i;
export const WHY_MAX = 140;

/** A data-supplied `why` is shown only if it is short, plain and carries no advice or verdict words. */
export function whyOk(why: unknown): why is string {
  if (typeof why !== "string") return false;
  const s = why.trim();
  return s.length > 0 && s.length <= WHY_MAX && !BANNED.test(s);
}

/** A pending bill is not law: it never gets a badge. */
export function isPending(c: Pick<Change, "document_status" | "after">): boolean {
  return c.document_status === "pending" || c.after?.result === "pending";
}

export function impactOf(c: Change): RenterImpact | null {
  const ri = c.renter_impact;
  if (!ri || typeof ri !== "object") return null;
  const v = ri.verdict;
  return v === "better" || v === "worse" || v === "unchanged" || v === "unclear" ? (ri as RenterImpact) : null;
}

/** The badge for one diff change, or null (missing / unknown value / pending). */
export function badgeFor(c: Change): Badge | null {
  if (isPending(c)) return null;
  const ri = impactOf(c);
  if (!ri) return null;
  const kind: BadgeKind | null =
    ri.verdict === "better" ? "adds" : ri.verdict === "worse" ? "narrows" : ri.verdict === "unclear" ? "unclear" : ri.verdict === "unchanged" ? "same" : null;
  if (!kind) return null;
  const conflict = kind === "unclear" && (c.conflict_flag_changed || !!c.after?.conflict_flag || !!c.before?.conflict_flag);
  const text = conflict ? BADGE_TEXT.unclear_conflict : BADGE_TEXT[kind];
  return { kind, arrow: ARROW[kind], text, label: `${text}. ${UNIT_MAY_DIFFER}`, why: whyOk(ri.why) ? ri.why.trim() : null };
}

/**
 * The badge for a history event (built from a rule's effective date, not from the diff): only when the same rule
 * has a diff change at this address, and that change's verdict. Several changes for the rule: the one whose
 * effective date matches the event; if none matches and there is more than one, no badge (never guess).
 */
export function eventBadge(rec: AddressChanges | null | undefined, ruleId: string, date?: string): Badge | null {
  if (!rec) return null;
  // A rule's end (sunset/repeal) is its own event (endBadge); a start event never takes the end change's verdict.
  const cs = rec.entries.flatMap((e) => e.changes).filter((c) => c.team_rule_id === ruleId && !endsIn(c));
  const pick = (date ? cs.find((c) => c.effective_from === date) : undefined) ?? (cs.length === 1 ? cs[0] : undefined);
  return pick ? badgeFor(pick) : null;
}

/**
 * A change caused by the rule's own end date (sunset or repeal): the rule is removed and its `effective_until` falls inside
 * the source's window (before < until <= after). Without a window, any removed change carrying `effective_until`.
 */
export function endsIn(c: Pick<Change, "change" | "effective_until">, win?: { before_as_of: string; after_as_of: string } | null): boolean {
  const u = c.effective_until;
  if (c.change !== "removed" || !u) return false;
  return !win || (win.before_as_of < u && u <= win.after_as_of);
}

/** The date a change is about: its end date when the rule ends, else its start date. */
export function changeDate(c: Change, win?: { before_as_of: string; after_as_of: string } | null): string | null {
  return endsIn(c, win) ? (c.effective_until ?? null) : c.effective_from;
}

/** The badge for an "Ends: …" history event: the verdict of that rule's end change (removed, same end date) at this address. */
export function endBadge(rec: AddressChanges | null | undefined, ruleId: string, until: string): Badge | null {
  if (!rec) return null;
  const c = rec.entries.flatMap((e) => e.changes).find((x) => x.team_rule_id === ruleId && endsIn(x) && x.effective_until === until);
  return c ? badgeFor(c) : null;
}

/**
 * The email's first line (fixed rule). All ↑ -> adds; all ↓ -> narrows; ↑ and ↓ together -> "some add, some narrow".
 * Anything else (only grey, ↑ or ↓ with grey, no badge at all) -> the neutral "Rules change at …" line ("=" badges
 * count as no direction): the
 * per-item badges carry the detail, and the line never claims a direction the data doesn't show.
 * Past only (every date on or before the as-of date) -> "has changed … since <date>".
 */
export function firstLine(
  changes: Change[],
  short: string,
  asOf: string,
  fallbackDate?: string | null,
  win?: { before_as_of: string; after_as_of: string } | null,
): string {
  const live = changes.filter((c) => !isPending(c));
  const kinds = new Set(live.map(badgeFor).filter((b): b is Badge => !!b && b.kind !== "same").map((b) => b.kind));
  const dates = (live.length ? live : changes).map((c) => changeDate(c, win)).filter((d): d is string => !!d).sort();
  const earliest = dates[0] ?? fallbackDate ?? null;
  const past = dates.length > 0 ? dates.every((d) => d <= asOf) : !!earliest && earliest <= asOf;
  const when = earliest ? ` ${past ? "since" : "from"} ${formatDate(earliest)}` : "";
  const only = (k: BadgeKind) => kinds.size === 1 && kinds.has(k);
  if (only("adds")) return past ? `A change has added renter protection at ${short}${when}.` : `A change adds renter protection at ${short}${when}.`;
  if (only("narrows")) return past ? `A change has narrowed renter protection at ${short}${when}.` : `A change narrows renter protection at ${short}${when}.`;
  if (kinds.has("adds") && kinds.has("narrows"))
    return past ? `Rules have changed at ${short}${when}: some added protection, some narrowed it.` : `Rules change at ${short}${when}: some add protection, some narrow it.`;
  return past ? `Rules have changed at ${short}${when}.` : `Rules change at ${short}${when}.`;
}
