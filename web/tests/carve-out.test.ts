// A carve-out (exemption, "not restricted") never leads a tile: Newark's § 19:2-18.3 must not
// be the "Rent increases" answer while § 19:2-22 (25% a year) applies.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import { isCarveOut } from "../lib/plain.ts";
import type { Rule } from "../lib/types.ts";

const raw = JSON.parse(readFileSync(join(repoRoot, "web/data/live/rules.json"), "utf8"));
const list: Rule[] = Array.isArray(raw) ? raw : Object.values(raw.rules ?? raw);
const byId = Object.fromEntries(list.map((r) => [r.rule_id, r]));

test("exemptions and loosenings are carve-outs", () => {
  for (const id of ["NJ-NEWARK-RENT-19:2-18.3", "NJ-RENT-2A:42-84.5", "MA-RENT-40P"]) {
    if (byId[id]) assert.ok(isCarveOut(byId[id]), id);
  }
});

test("main rules are not carve-outs", () => {
  for (const id of ["NJ-NEWARK-RENT-19:2-22", "CA-RENT-1947.12", "NJ-EVICT-2A:18-61.1"]) {
    if (byId[id]) assert.ok(!isCarveOut(byId[id]), id);
  }
});
