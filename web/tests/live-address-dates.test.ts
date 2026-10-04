import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { liveAddressPayload, evaluateSample } from "../lib/live-address.ts";
import { addressPageData } from "../lib/address-page-data.ts";
import { addressDates, validAsOf, requestedDate } from "../lib/address-dates.ts";
import { evaluateRecord } from "../lib/live-engine.ts";
import type { Dataset } from "../lib/types.ts";
const read = (name: string) => JSON.parse(readFileSync(new URL(`../data/live/${name}.json`, import.meta.url), "utf8"));
const data: Dataset = Object.fromEntries(["meta", "rules", "lookups", "addresses", "excerpts", "findings"].map(k => [k, read(k)])) as Dataset;
const env = { LIVE_ENGINE_ORIGIN: "http://127.0.0.1:5330" };
const fixtures = JSON.parse(execFileSync("python3", ["-c", `
import importlib.util,json
s=importlib.util.spec_from_file_location('endpoint','api/engine.py');e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
a={r['address_id']:r for r in json.load(open('data/addresses.resolved.json'))['addresses']}
print(json.dumps({day:e.evaluate({'record':a[id],'as_of':day}) for id,day in [('A0256','2026-10-01'),('A0256','2027-07-01'),('A0256','2027-07-02'),('A0001','2025-12-31')]}))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }));
const engineFetch: typeof fetch = async (_url, init) => {
  const body = JSON.parse(init!.body as string);
  return Response.json(fixtures[body.as_of]);
};
const options = { env, fetch: engineFetch };

test("real calendar dates and leap days", () => {
  for (const d of ["2027-07-02", "2028-02-29", "1900-01-01", "2100-12-31"]) {
    assert.equal(validAsOf(d), true);
  }
  for (const d of ["2027-02-29", "2026-04-31", "2026-13-01", "2026-1-1", "", "0000-01-01", "2101-01-01"]) assert.equal(validAsOf(d), false);
  assert.equal(requestedDate(["2026-01-01"], "2026-10-01"), null);
  assert.equal(requestedDate(undefined, "2026-10-01"), "2026-10-01");
});

test("API evaluates NJ FAIR Act on exact effective date and later, rather than October snapshot", async () => {
  for (const day of ["2026-10-01", "2027-07-01", "2027-07-02"]) {
    const result = await liveAddressPayload(data, "A0256", day, options);
    assert.equal(result.status, 200);
    assert.equal(result.body.as_of, day);
    assert.equal(result.body.evaluation, "live");
    assert.equal(result.body.as_of_requested, undefined);
    const rows = result.body.results as {rule_id:string;result:string;rule:{status:string}}[];
    const ban = rows.find(r => r.rule_id === "NJ-ALG-56:9-23")!;
    assert.equal(ban.result, day === "2026-10-01" ? "not_yet_effective" : "applies");
    assert.equal(ban.rule.status, day === "2026-10-01" ? "not_yet_effective" : "in_force");
  }
});

test("past CA answers and page timeline follow requested date without changing saved data", async () => {
  const original = JSON.stringify(data);
  const evaluated = await evaluateSample(data, "A0001", "2025-12-31", options);
  assert.equal(evaluated!.results.find(r => r.rule_id === "CA-ALG-16729")?.result, "not_yet_effective");
  const address = data.addresses.find(a => a.address_id === "A0001")!;
  const {view} = addressPageData(data, address, evaluated!.results, {asOf:evaluated!.asOf});
  assert.equal(view.asOf, "2025-12-31");
  assert.ok(view.future.some(e => e.ruleId === "CA-ALG-16729"));
  assert.ok(addressDates(data, address, view.asOf).timeline.some(e => e.date === "2026-01-01"));
  assert.equal(JSON.stringify(data), original);
});

test("offline engine only falls back to exactly matching snapshot, never substitutes dates", async () => {
  const offline = { env: {LIVE_ENGINE_DISABLED:"1"} };
  const saved = await liveAddressPayload(data, "A0256", "2026-10-01", offline);
  assert.equal(saved.status, 200); assert.equal(saved.body.evaluation, "snapshot");
  const unavailable = await liveAddressPayload(data, "A0256", "2027-07-02", offline);
  assert.equal(unavailable.status, 503); assert.equal(unavailable.body.as_of, "2027-07-02");
  assert.equal(unavailable.body.results, undefined);
  assert.equal((await liveAddressPayload(data, "A0256", "2027-02-29", offline)).status, 400);
  assert.equal((await liveAddressPayload(data, "missing", "2027-07-02", offline)).status, 404);
});

test("sample request preserves original I3 facts, provenance and assumptions", async () => {
  const records = JSON.parse(readFileSync(new URL("../data/addresses.resolved.json", import.meta.url),"utf8")).addresses;
  await evaluateSample(data, "A0256", "2026-10-01", {env, fetch: async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string).record, records.find((a:{address_id:string}) => a.address_id === "A0256"));
    return Response.json(fixtures["2026-10-01"]);
  }});
});

test("valid empty engine result is distinct from engine failure for arbitrary dates", async () => {
  const result = await evaluateRecord({}, data.rules, "2025-12-31", {env, fetch: async () => Response.json({...fixtures["2025-12-31"], results:[]})});
  assert.deepEqual(result?.results, []);
});


test("timeline navigation stays anchored to known changes after moving forward or backward", () => {
  const address = data.addresses.find(a => a.address_id === "A0256")!;
  const baseline = addressDates(data, address, "2026-10-01");
  for (const selected of ["2027-07-01", "2026-05-01", "2030-01-01"]) {
    const next = addressDates(data, address, selected);
    assert.deepEqual(next.timeline, baseline.timeline);
    assert.equal(next.baseline, "2026-10-01");
  }
  assert.ok(baseline.timeline.some(e => e.date === "2027-07-01"));
  assert.ok(baseline.timeline.some(e => e.date === "2026-05-01"));
});
