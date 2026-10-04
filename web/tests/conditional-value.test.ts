import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import { buildAddressView } from "../lib/address-view.ts";
import type { Address, Rule, Result } from "../lib/types.ts";

const read = (name: string) => JSON.parse(readFileSync(join(repoRoot, "web/data/live", name), "utf8"));
const addresses = read("addresses.json") as Address[];
const rules = Object.fromEntries((read("rules.json") as Rule[]).map(r => [r.rule_id, r]));
const results = read("lookups.json")["2026-10-01"].A0398 as Result[];

test("A0398 keeps both deposit amounts through the web mapper and card", () => {
  const deposit = results.find(r => r.rule_id === "CA-DEP-1950.5")!;
  assert.equal(deposit.result, "applies");
  assert.equal(typeof deposit.value, "object");
  assert.ok(deposit.value && typeof deposit.value === "object");
  assert.equal(deposit.value.conditional.length, 2);
  const view = buildAddressView({ address: addresses.find(a => a.address_id === "A0398")!, results, rules,
    asOf: "2026-10-01", cityName: "San Francisco", findings: {} });
  const tile = view.tiles.find(t => t.id === "dep")!;
  assert.match(JSON.stringify(tile), /one month[’']s rent/);
  assert.match(JSON.stringify(tile), /two months[’'] rent/);
  assert.match(tile.expl, /service member/);
  assert.ok(tile.missing.some(m => m.why.includes("collectively")));
  assert.ok(tile.notes.some(n => n.kind === "depends"));
});
