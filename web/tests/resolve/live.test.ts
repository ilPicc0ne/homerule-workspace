// Opt-in smoke test against the real Census geocoder: LIVE=1 npm test
import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuery } from "../../lib/resolve/resolve.ts";

const live = process.env.LIVE === "1";

const cases: [string, string | null, string][] = [
  ["20 Civic Center Plaza, Santa Ana, CA", "CA-SANTA-ANA", "covered"],
  ["4801 E 3rd St, Los Angeles, CA 90022", null, "state_only"],
  ["333 Washington St, Brookline, MA", null, "state_only"],
  ["350 5th Ave, New York, NY", null, "not_covered"],
  ["280 Grove St, Jersey City, NJ", "NJ-JERSEY-CITY", "covered"],
];

for (const [q, id, coverage] of cases) {
  test(`live: ${q}`, { skip: !live && "set LIVE=1" }, async () => {
    const r = await resolveQuery(q, { fetch: globalThis.fetch, timeoutMs: 20000 });
    assert.equal(r.kind, "address", JSON.stringify(r));
    if (r.kind !== "address") return;
    assert.equal(r.coverage, coverage);
    if (id) assert.equal(r.tree[r.tree.length - 1].id, id);
  });
}
