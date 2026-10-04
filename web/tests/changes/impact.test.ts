// Change verdict -> badge mapping (lib/changes/impact.ts) and the email's first line, against fixtures shaped like
// PR #59's renter_impact (tests/fixtures/changes/renter-impact.json). The verdict is the engine's; the web only maps it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNED, badgeFor, eventBadge, firstLine, isPending, whyOk, WHY_MAX } from "../../lib/changes/impact.ts";
import { BADGE_STYLE, render } from "../../lib/changes/email.ts";
import { changes as liveChanges } from "../../lib/changes/data.ts";
import type { AddressChanges, Change } from "../../lib/changes/types.ts";
import type { AddressChange } from "../../lib/changes/email.ts";

const FX = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "changes", "renter-impact.json"), "utf8")) as Record<
  "preemption" | "superseded" | "mixed" | "past_only",
  AddressChanges
> & { as_of: string };
const AS_OF = FX.as_of;

const base: Change = FX.mixed.entries[0].changes[0];
const withRi = (ri: unknown, extra: Partial<Change> = {}): Change => ({ ...base, ...extra, renter_impact: ri as Change["renter_impact"] });
const mail = (rec: AddressChanges, id = "A9999"): AddressChange => ({ address_id: id, label: rec.label, as_of: AS_OF, entry: rec.entries[0] });

// ---- mapping

test("better -> ↑ adds, worse -> ↓ narrows; wording describes the rule, aria adds 'Your unit may differ.'", () => {
  const up = badgeFor(withRi({ verdict: "better" }))!;
  assert.deepEqual([up.kind, up.arrow, up.text], ["adds", "↑", "This change adds renter protection"]);
  assert.equal(up.label, "This change adds renter protection. Your unit may differ.");
  const dn = badgeFor(withRi({ verdict: "worse" }))!;
  assert.deepEqual([dn.kind, dn.arrow, dn.text], ["narrows", "↓", "This change narrows renter protection"]);
});

test("unclear -> grey: a missing fact, or a conflict flag involved", () => {
  const fact = badgeFor(withRi({ verdict: "unclear" }))!;
  assert.deepEqual([fact.kind, fact.arrow, fact.text], ["unclear", "?", "Depends on a fact we don't have"]);
  const conflict = badgeFor(withRi({ verdict: "unclear" }, { conflict_flag_changed: true }))!;
  assert.equal(conflict.text, "May conflict with another rule, not decided");
});

test("unchanged, missing, malformed or old-style values -> no badge (never guess)", () => {
  assert.equal(badgeFor(withRi({ verdict: "unchanged" })), null);
  assert.equal(badgeFor(withRi(undefined)), null);
  assert.equal(badgeFor(withRi(null)), null);
  assert.equal(badgeFor(withRi({})), null);
  assert.equal(badgeFor(withRi({ verdict: "mixed" })), null);
  assert.equal(badgeFor(withRi("more_protection")), null);
});

test("pending bill -> no badge, whether flagged by document_status or by result", () => {
  const bill = FX.mixed.entries[0].changes.find((c) => c.team_rule_id === "TEST-BILL")!;
  assert.ok(isPending(bill));
  assert.equal(badgeFor(bill), null);
  assert.equal(badgeFor(withRi({ verdict: "better" }, { after: { result: "pending", conflict_flag: false, explanation: "" } })), null);
});

test("why: shown only if ≤ 140 chars and free of advice / verdict words", () => {
  assert.ok(whyOk("A statewide 7% cap replaces the city's 2% cap."));
  for (const bad of ["You must get a reason.", "Check your lease.", "This is illegal now.", "Landlords should file.",
    "Units are compliant.", "x".repeat(WHY_MAX + 1), "", "   ", null, 42]) assert.equal(whyOk(bad), false, String(bad));
  assert.equal(badgeFor(withRi({ verdict: "worse", why: "You must move." }))!.why, null);   // failing -> badge alone
  assert.equal(badgeFor(withRi({ verdict: "worse", why: " Cap rises to 7%. " }))!.why, "Cap rises to 7%.");
});

// ---- fixtures

test("preemption: city rule replaced by a weaker state rule -> both changes ↓ (judged by levels)", () => {
  const cs = FX.preemption.entries[0].changes;
  assert.deepEqual(cs.map((c) => badgeFor(c)?.kind), ["narrows", "narrows"]);
  assert.equal(firstLine(cs, "1 Test St", AS_OF), "A change narrows renter protection at 1 Test St from Jul 1, 2027.");
  assert.equal(eventBadge(FX.preemption, "TEST-STATE-CAP", "2027-07-01")?.kind, "narrows");   // the history event takes the diff's verdict
});

test("superseded rule: badge only from its own diff change, never from 'takes effect' + rule direction", () => {
  assert.equal(eventBadge(FX.superseded, "TEST-STATE-OLD")?.kind, "adds");     // the topic level rose: the engine says better
  assert.equal(eventBadge(FX.superseded, "NO-DIFF-RULE"), null);               // no diff entry -> no badge
  assert.equal(eventBadge(undefined, "TEST-STATE-OLD"), null);
  // the city rule's why says "You must": dropped, badge alone
  assert.equal(eventBadge(FX.superseded, "TEST-CITY-NEW", "2027-01-01")?.why, null);
  // two changes for one rule and no date match -> no badge
  const twice: AddressChanges = { ...FX.superseded, entries: [FX.superseded.entries[0], FX.superseded.entries[0]] };
  assert.equal(eventBadge(twice, "TEST-STATE-OLD", "1999-01-01"), null);
  assert.equal(eventBadge(twice, "TEST-STATE-OLD", "2020-01-01")?.kind, "adds");
});

test("mixed email (↑ + ↓ + grey + a pending bill): neutral subject, 'some add, some narrow', one badge per item, none on the bill", () => {
  const m = render(mail(FX.mixed));
  assert.equal(m.subject, "Something changes for your rent rules at 3 Test St");
  const lead = "Rules change at 3 Test St from Mar 1, 2027: some add protection, some narrow it.";
  for (const part of [m.text, m.html]) {
    assert.ok(part.includes(lead), "first line");
    assert.match(part, /This change adds renter protection/);
    assert.match(part, /This change narrows renter protection/);
    assert.match(part, /May conflict with another rule, not decided/);
  }
  assert.equal(m.text.match(/This change (adds|narrows) renter protection/g)?.length, 2);   // the bill (also "better") has none
  assert.match(m.text, /• Rent increases — [^\n]*\n/);
  assert.doesNotMatch(m.text.split("\n").find((l) => l.startsWith("• Rent increases"))!, /protection\)/);
  assert.match(m.html, /aria-label="This change adds renter protection\. Your unit may differ\."/);
  assert.match(m.html, /\/a\/A9999#h-ahead" class="btn"[^>]*>See the details/);
});

test("past-only email: 'has changed … since <date>', with the why and a link to the law text", () => {
  const m = render(mail(FX.past_only));
  for (const part of [m.text, m.html]) assert.ok(part.includes("A change has added renter protection at 4 Test St since Jan 1, 2026."));
  assert.match(m.text, /Summary: Landlords may no longer ask about past evictions on the application\. · see the law text: https:\/\/yourhomerule\.com\/changes\/A9999#c-TEST-PAST/);
  assert.match(m.html, /see the law text<\/a>/);
});

test("first line: all ↑, ↑ + grey, only grey, no verdicts", () => {
  const up = withRi({ verdict: "better" });
  const grey = withRi({ verdict: "unclear" }, { team_rule_id: "G" });
  assert.equal(firstLine([up], "X St", AS_OF), "A change adds renter protection at X St from Mar 1, 2027.");
  assert.equal(firstLine([up, grey], "X St", AS_OF), "Rules change at X St from Mar 1, 2027.");
  assert.equal(firstLine([grey], "X St", AS_OF), "Rules change at X St from Mar 1, 2027.");
  assert.equal(firstLine([withRi(undefined)], "X St", AS_OF), "Rules change at X St from Mar 1, 2027.");
  assert.equal(firstLine([withRi({ verdict: "worse" }, { effective_from: "2026-01-01" })], "X St", AS_OF),
    "A change has narrowed renter protection at X St since Jan 1, 2026.");
});

// ---- guards

test("banned words: none in any rendered email (fixtures and the live diff) or any shown why", () => {
  const verdictWords = /\b(illegal|compliant|non-compliant|must|should|you should|we recommend)\b/i;
  const recs: [string, AddressChanges][] = [
    ...(["preemption", "superseded", "mixed", "past_only"] as const).map((k) => [k, FX[k]] as [string, AddressChanges]),
    ...Object.entries(liveChanges.addresses),
  ];
  for (const [id, rec] of recs) {
    for (const entry of rec.entries) {
      const m = render({ address_id: id, label: rec.label, as_of: AS_OF, entry });
      for (const part of [m.subject, m.text, m.html]) assert.doesNotMatch(part, verdictWords, id);
      for (const c of entry.changes) {
        const why = badgeFor(c)?.why;
        if (why) assert.doesNotMatch(why, BANNED, `${id} ${c.team_rule_id}`);
      }
    }
  }
});

test("badge colours: AA contrast (4.5:1) on their tint", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs: [string, string][] = [
    ...Object.values(BADGE_STYLE).map((s) => [s.color, s.bg] as [string, string]),
    ["#9BDDB7", "#173D2A"], ["#F6B5AE", "#45201F"], ["#C7CDD4", "#2A3036"],   // email dark mode (lib/alerts/layout.ts)
    ["#11643D", "#E2F2E8"], ["#9B2C2C", "#FBE9E7"], ["#4D5256", "#ECEDEE"],   // page tokens (v3.css --*-ink on --*-tint)
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
});
