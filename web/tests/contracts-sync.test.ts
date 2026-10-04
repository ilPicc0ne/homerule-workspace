// Vercel only uploads web/, so web/ keeps copies of the canonical files. They must not drift.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.ts";
import { SYNCED } from "../scripts/sync-contracts.ts";

for (const { from, to } of SYNCED) {
  test(`web copy matches ${from}`, () => {
    const src = join(repoRoot, from);
    const dst = join(repoRoot, to);
    assert.ok(existsSync(src), `${from} missing`);
    assert.ok(existsSync(dst), `${to} missing: run npm run sync`);
    assert.equal(readFileSync(dst, "utf8"), readFileSync(src, "utf8"), `${to} drifted from ${from}: run npm run sync`);
  });
}
