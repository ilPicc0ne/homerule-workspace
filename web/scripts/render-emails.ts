// Render the alert and confirmation emails to local HTML + text files, to look at them in a browser (no mail is sent).
//
//   node scripts/render-emails.ts [--out DIR]     default DIR: $TMPDIR/homerule-emails
//
// Writes <case>.html, <case>.txt per case, plus inbox.html: the inbox list as a mail app shows it (sender, subject,
// preheader). Cases: up (all ↑), down (all ↓, the CA 2030 "Ends on" sunset), mixed (↑ ↓ and grey), demo (a
// demo-labelled ingest), past (past only), confirm (double opt-in).
//
// RENDER FIXTURES ONLY: the entries come from the live diff (web/data/changes.full.json) or are shaped like it, and the
// renter_impact verdicts are hand-set to exercise each layout case (PR #59 is not merged). They are not engine output
// and never go to a subscriber.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changes } from "../lib/changes/data.ts";
import { addressChange, render } from "../lib/changes/email.ts";
import type { AddressChange } from "../lib/changes/email.ts";
import type { Change, Entry } from "../lib/changes/types.ts";
import { confirmEmail } from "../lib/alerts/confirm-email.ts";
import { esc } from "../lib/alerts/html.ts";

const SITE = "https://yourhomerule.com";
const i = process.argv.indexOf("--out");
const OUT = i > 0 ? process.argv[i + 1] : join(tmpdir(), "homerule-emails");

type Verdict = "better" | "worse" | "unclear";
const withVerdicts = (ac: AddressChange, v: Record<string, Verdict>, why: Record<string, string> = {}): AddressChange => ({
  ...ac,
  entry: {
    ...ac.entry,
    changes: ac.entry.changes.map((c) => (v[c.team_rule_id] ? { ...c, renter_impact: { verdict: v[c.team_rule_id], why: why[c.team_rule_id] ?? null } } : c)),
  },
});

const need = (ac: AddressChange | null, what: string): AddressChange => {
  if (!ac) throw new Error(`no entry for ${what} in web/data/changes.full.json`);
  return ac;
};

/** A change shaped like the diff's, for the hand-made cases. */
const change = (id: string, cat: string, kind: Change["change"], from: string, verdict: Verdict | null): Change => ({
  team_rule_id: id, change: kind,
  before: kind === "added" ? null : { result: "applies", conflict_flag: false, explanation: "" },
  after: kind === "removed" ? null : { result: "applies", conflict_flag: false, explanation: "" },
  result_changed: true, conflict_flag_changed: false, scored: true, title: null, citation: null, requirement_quote: null,
  source_url: null, effective_from: from, jurisdiction_id: "MA", category: cat, document_status: "enacted", origin: "starter",
  renter_impact: verdict ? { verdict } : null,
});

const oxford = (entry: Partial<Entry> & { changes: Change[] }): AddressChange => ({
  address_id: "A0010", label: "134 Oxford St, Cambridge, MA", as_of: "2026-10-01",
  entry: { source: "asof:2026-10-01..2027-07-02", kind: "as_of", title: "fixture", before_as_of: "2026-10-01", after_as_of: "2027-07-02", demo_label: null, ...entry },
});

const cases: Record<string, AddressChange> = {
  up: withVerdicts(need(addressChange(changes, "A0256", "asof:2026-10-01..2027-07-02"), "A0256 FAIR Act"), { "NJ-ALG-56:9-23": "better" }),
  down: withVerdicts(need(addressChange(changes, "A0019", "asof:2029-12-31..2030-01-02"), "A0019 CA sunset"), {
    "CA-RENT-1947.12": "worse",
    "CA-EVICT-1946.2": "worse",
  }),
  mixed: oxford({
    changes: [
      change("MA-FEE-186", "application_screening_fees", "changed", "2027-03-01", "better"),
      change("MA-DEP-186", "security_deposits", "removed", "2027-05-01", "worse"),
      change("MA-CAMBRIDGE-SCREEN-14.04", "screening_restrictions", "changed", "2027-07-01", "unclear"),
    ],
  }),
  demo: oxford({
    source: "ingest:X001@2026-10-01", kind: "ingest", before_as_of: "2026-10-01", after_as_of: "2026-10-01",
    demo_label: "Demo: fictional ordinance",
    changes: [change("MA-FEE-186", "application_screening_fees", "changed", "2027-07-01", "better")],
  }),
  past: withVerdicts(
    need(addressChange(changes, "A0019", "asof:2025-12-31..2026-01-02"), "A0019 Jan 2026"),
    { "CA-ALG-16729": "better", "CA-FEE-1950.6": "better" },
    { "CA-FEE-1950.6": "Screening fees are capped at the landlord's actual cost." },
  ),
};

type Out = { name: string; from: string; subject: string; preheader: string; html: string; text: string };
const preheaderOf = (html: string) =>
  (html.match(/<div[^>]*display:none[^>]*>([^<]*)/)?.[1] ?? "").replace(/&#847;|&#8203;|&nbsp;|&zwnj;/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();

const outs: Out[] = Object.entries(cases).map(([name, ac]) => {
  const m = render(ac, { site: SITE, token: "preview-only" });
  return { name, from: m.from, subject: m.subject, preheader: preheaderOf(m.html), html: m.html, text: m.text };
});
const c = confirmEmail({
  to: "renter@example.com", label: "134 Oxford St, Cambridge, MA", addressId: "A0010", site: SITE,
  token: "preview-only", unsubToken: "preview-only", asOfText: "October 1, 2026",
});
outs.push({ name: "confirm", from: c.from, subject: c.subject, preheader: preheaderOf(c.html), html: c.html, text: c.text });

mkdirSync(OUT, { recursive: true });
for (const o of outs) {
  writeFileSync(join(OUT, `${o.name}.html`), o.html);
  writeFileSync(join(OUT, `${o.name}.txt`), `From: ${o.from}\nSubject: ${o.subject}\nPreheader: ${o.preheader}\n\n${o.text}\n`);
}

// The inbox list: what a renter sees before opening (sender name, subject, preheader), at phone width.
const sender = (from: string) => from.replace(/\s*<.*$/, "");
const rows = outs
  .map(
    (o) => `<li><div class="top"><b>${esc(sender(o.from))}</b><span>9:41</span></div><div class="sub">${esc(o.subject)}</div><div class="pre">${esc(o.preheader)}</div><div class="case">${esc(o.name)}</div></li>`,
  )
  .join("\n");
writeFileSync(
  join(OUT, "inbox.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inbox</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:15px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#111}
h1{font-size:28px;margin:16px 16px 8px} ul{list-style:none;margin:0;padding:0}
li{padding:10px 16px 12px 28px;border-bottom:1px solid #e5e5ea;position:relative}
li::before{content:"";position:absolute;left:10px;top:16px;width:10px;height:10px;border-radius:50%;background:#0a84ff}
.top{display:flex;justify-content:space-between;font-size:16px} .top span{color:#8e8e93;font-size:14px}
.sub{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pre{color:#6e6e73;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.case{position:absolute;right:16px;bottom:4px;font-size:10px;color:#c7c7cc}
@media (prefers-color-scheme:dark){body{background:#000;color:#f2f2f7}li{border-color:#2c2c2e}.pre{color:#98989f}}
</style></head><body><h1>Inbox</h1><ul>
${rows}
</ul></body></html>`,
);

console.log(`${outs.length} emails + inbox.html → ${OUT}`);
for (const o of outs) console.log(`  ${o.name.padEnd(8)} ${o.subject}\n  ${"".padEnd(8)} ${o.preheader}`);
