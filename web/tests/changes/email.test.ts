// The alert email preview: rendered from the same diff as the change log (I6). Nothing is sent.
import test from "node:test";
import assert from "node:assert/strict";
import { changes } from "../../lib/changes/data.ts";
import { addressChange, esc, FROM, plainChange, render } from "../../lib/changes/email.ts";
import type { AddressChange } from "../../lib/changes/email.ts";
import type { Change } from "../../lib/changes/types.ts";

const j3 = () => {
  const ac = addressChange(changes, "A0256", "asof:2026-10-01..2027-07-02");
  assert.ok(ac, "A0256 has the FAIR Act change");
  return ac;
};

test("J3: Hoboken FAIR Act email is one plain sentence and a link to the address page", () => {
  const ac = j3();
  const m = render(ac);
  assert.equal(m.from, FROM);
  assert.equal(m.from, "HomeRule <alerts@yourhomerule.com>");
  assert.equal(m.subject, "Something changes for your rent rules at 327 Jackson St");
  for (const part of [m.text, m.html]) {
    assert.match(part, /Not legal advice/);
    assert.match(part, /October 1, 2026/);                          // the as-of date
    assert.match(part, /Software that sets rents/);                 // topic name, as on the address page
    assert.match(part, /Jul 1, 2027/);                              // effective date
    assert.match(part, /https:\/\/yourhomerule\.com\/a\/A0256/);   // the button goes to the address page
    assert.match(part, /\/changes\/A0256/);                       // secondary link to the change log
    assert.match(part, /See the details/);
    assert.match(part, /\/a\/A0256#h-ahead/);                     // "See the details" -> the address page history
    // no legal title, status jargon, citations or quotes
    assert.doesNotMatch(part, /coordinating function|Enacted, not yet in effect|56:9-23|→|&rarr;|Citation|blockquote/);
  }
});

test("renter-impact badge: from #59's renter_impact.verdict only; old impact strings are ignored", () => {
  const base = j3();
  const withImpact = (extra: object): AddressChange => ({
    ...base, entry: { ...base.entry, changes: base.entry.changes.map((c) => ({ ...c, ...extra })) },
  });
  const absent = render(base);
  for (const part of [absent.text, absent.html]) assert.doesNotMatch(part, /renter protection|protection for renters/);
  const better = render(withImpact({ renter_impact: { verdict: "better", topic: "algorithmic_rent_setting" } }));
  assert.match(better.text, /↑ This change adds renter protection\. Your unit may differ\./);
  assert.match(better.html, /↑<\/span> This change adds renter protection/);
  assert.match(render(withImpact({ renter_impact: { verdict: "worse" } })).html, /↓<\/span> This change narrows renter protection/);
  // the classifier strings the old impactOf read are not #59's shape: no badge
  assert.doesNotMatch(render(withImpact({ impact: "more_protection", renter_impact: "more_protection" })).html, /renter protection/);
  assert.equal(plainChange(base.entry.changes[0], base.as_of).badge, null);
});

test("unsubscribe link and List-Unsubscribe header", () => {
  const m = render(j3(), { token: "abc" });
  assert.equal(m.unsubscribe_url, "https://yourhomerule.com/unsubscribe?a=A0256&t=abc");
  assert.equal(m.headers["List-Unsubscribe"], "<https://yourhomerule.com/api/unsubscribe?a=A0256&t=abc>");
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(render(j3(), { token: "a+b/c=&d" }).unsubscribe_url, /t=a%2Bb%2Fc%3D%26d$/);   // tokens are URL-encoded
  assert.ok(m.html.includes(esc(m.unsubscribe_url)));
  assert.ok(m.text.includes(m.unsubscribe_url));
  assert.match(render(j3()).unsubscribe_url, /%7B%7Bunsubscribe_token%7D%7D/);   // placeholder in the preview
  for (const part of [m.text, m.html]) {
    assert.match(part, /Prototype built at a hackathon/);                       // prototype notice in every footer
    assert.match(part, /PLACEHOLDER: HomeRule postal address/);
  }
});

test("no verdicts or advice words in any email", () => {
  for (const id of Object.keys(changes.addresses)) {
    const ac = addressChange(changes, id);
    if (!ac) continue;
    const m = render(ac);
    for (const part of [m.subject, m.text, m.html]) {
      assert.doesNotMatch(part, /\b(compliant|non-compliant|illegal|you should|we recommend)\b/i, id);
    }
  }
});

const demoChange: Change = {
  team_rule_id: "TEST-RULE", change: "added", before: null,
  after: { result: "not_yet_effective", conflict_flag: false, explanation: "Takes effect later <b>." },
  result_changed: true, conflict_flag_changed: false, scored: true, title: "Test rule", citation: "Test § 1",
  requirement_quote: "No fee <script>alert(1)</script>", source_url: "javascript:alert(1)", effective_from: "2027-03-01",
  jurisdiction_id: "MA-CAMBRIDGE", category: "application_screening_fees", document_status: "enacted", origin: "ingested",
};

const demo: AddressChange = {
  address_id: "A0010", label: "134 Oxford St, Cambridge, MA", as_of: "2026-10-01",
  entry: { source: "ingest:XTEST@2026-10-01", kind: "ingest", title: "test", before_as_of: "2026-10-01",
    after_as_of: "2026-10-01", demo_label: "Demo: fictional ordinance", changes: [demoChange] },
};

test("a demo source is labelled in subject, text and html", () => {
  const m = render(demo);
  assert.match(m.subject, /^\[Demo: fictional ordinance\]/);
  assert.match(m.text, /DEMO: FICTIONAL ORDINANCE/);
  assert.match(m.html, /Demo: fictional ordinance/);
  assert.match(m.text, /Application fees — From Mar 1, 2027: Takes effect later|Application fees — /);
  assert.doesNotMatch(m.html, /<script>/);
});

test("html escapes the data and shows no source links or quotes", () => {
  const m = render({ ...demo, label: "1 <script>x</script> St, Cambridge, MA" });
  assert.doesNotMatch(m.html, /<script>/);
  assert.doesNotMatch(m.html, /<b>\./);
  assert.doesNotMatch(m.html, /javascript:/);
  assert.match(m.html, /&lt;script&gt;/);
});

test("every changed address renders, as-of on every payload", () => {
  assert.equal(changes.not_legal_advice, true);
  assert.ok(changes.as_of);
  for (const id of ["A0256", "A0016"]) {
    const ac = addressChange(changes, id);
    if (ac) assert.match(render(ac).text, new RegExp(`as of`));
  }
  assert.equal(addressChange(changes, "NOPE"), null);
});
