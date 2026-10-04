// Vercel only uploads web/, so web/ keeps copies of the canonical files. They must not drift.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import { SYNCED } from "../scripts/sync-contracts.ts";
import { LIVE_DIR, LIVE_FILES, buildLive, liveInputsPresent, serialise } from "../scripts/build-live.ts";

for (const { from, to } of SYNCED) {
  test(`web copy matches ${from}`, () => {
    const src = join(repoRoot, from);
    const dst = join(repoRoot, to);
    assert.ok(existsSync(src), `${from} missing`);
    assert.ok(existsSync(dst), `${to} missing: run npm run sync`);
    assert.equal(readFileSync(dst, "utf8"), readFileSync(src, "utf8"), `${to} drifted from ${from}: run npm run sync`);
  });
}

// The Live data source is generated from the engine outputs; the committed copy must match a fresh build.
const live = liveInputsPresent(repoRoot) ? buildLive(repoRoot) : null;
for (const name of LIVE_FILES) {
  test(`live data ${name} matches the engine outputs`, { skip: live ? false : "engine outputs or source texts not in this checkout" }, () => {
    const dst = join(repoRoot, LIVE_DIR, name);
    assert.ok(existsSync(dst), `${LIVE_DIR}/${name} missing: run npm run sync`);
    assert.equal(readFileSync(dst, "utf8"), serialise(live![name]), `${LIVE_DIR}/${name} drifted: run npm run sync`);
  });
}

test("live data: every published quote sits verbatim in its excerpt, and no excerpt is a whole source text", { skip: live ? false : "no inputs" }, () => {
  const rules = live!["rules.json"] as { rule_id: string; quoted_span: string | null }[];
  const excerpts = live!["excerpts.json"] as Record<string, { quote: string; before: string; after: string }>;
  for (const r of rules) {
    const e = excerpts[r.rule_id];
    if (!e) continue;
    assert.equal(e.quote, r.quoted_span, r.rule_id);
    assert.ok(e.before.length <= 330 && e.after.length <= 330, `${r.rule_id}: excerpt context too long`);
  }
});

test("live data: effective_until carries each rule's effective.until (sunset or repeal), null when none", { skip: live ? false : "no inputs" }, () => {
  const rules = live!["rules.json"] as { rule_id: string; effective_until?: string | null }[];
  const compiled = JSON.parse(readFileSync(join(repoRoot, "out/rules.compiled.json"), "utf8")) as { team_rule_id: string; effective: { until: string | null } }[];
  const until = new Map(compiled.map((c) => [c.team_rule_id, c.effective.until ?? null]));
  for (const r of rules) {
    assert.ok("effective_until" in r, `${r.rule_id}: effective_until missing`);
    assert.equal(r.effective_until, until.get(r.rule_id) ?? null, r.rule_id);
  }
  const byId = new Map(rules.map((r) => [r.rule_id, r]));
  assert.equal(byId.get("CA-RENT-1947.12")?.effective_until, "2030-01-01");
  assert.equal(byId.get("CA-EVICT-1946.2")?.effective_until, "2030-01-01");
});
