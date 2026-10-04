import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { engineRows, type EngineRow } from "../lib/engine-rows.ts";
import { engineEndpoint, liveEngine, typedEngineRecord } from "../lib/live-engine.ts";
import { typedAddress } from "../lib/typed-address.ts";
import { treeForJurisdiction } from "../lib/resolve/tree.ts";
import type { AddressResult } from "../lib/resolve/types.ts";
import type { Rule } from "../lib/types.ts";
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rules: Rule[] = read("../data/live/rules.json");
const lookups = read("../data/live/lookups.json");
const full = read("../../out/lookups.full.json");
const day = "2026-10-01";
const resolver: AddressResult = { kind: "address", source: "census", query: "123 Test St, Los Angeles, CA", matched_address: "123 TEST ST, LOS ANGELES, CA", as_of: day, not_legal_advice: true, coords: {lat:34,lon:-118}, tree: treeForJurisdiction("CA-LOS-ANGELES"), coverage: "covered", notes: [], warnings: [] };
const env = { LIVE_ENGINE_ORIGIN: "http://127.0.0.1:5328" };
const good = { as_of: day, not_legal_advice: true, engine: "a".repeat(64), results: full.addresses.A0001.results };
const answer = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), {status});

test("shared row mapper preserves all 500 published sample results, including A0001", () => {
  for (const [id, record] of Object.entries(full.addresses)) assert.deepEqual(engineRows((record as {results:EngineRow[]}).results, rules), lookups[day][id], id);
});

test("typed record has Census jurisdictions and unknown facts, no assumptions or street text", () => {
  const record = typedEngineRecord(resolver);
  assert.equal(record.jurisdictions.city, "CA-LOS-ANGELES");
  assert.ok(Object.values(record.facts).every(x => x === null));
  assert.deepEqual(record.assumptions, []);
  assert.deepEqual(record.confidence, {jurisdiction:.99,built:0,units:0});
  assert.doesNotMatch(JSON.stringify(record), /123 TEST|Test St/);
});

test("successful engine call uses the shared mapper and leaves provisional data untouched", async () => {
  const provisional = typedAddress(resolver, rules, resolver.query)!;
  const before = JSON.stringify(provisional);
  const result = await liveEngine(resolver, rules, day, {env, fetch: async (url, init) => {
    assert.equal(url, "http://127.0.0.1:5328/api/engine");
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(init!.body as string), {as_of:day,record:typedEngineRecord(resolver)});
    return new Response(JSON.stringify(good));
  }});
  assert.deepEqual(result?.results, lookups[day].A0001);
  assert.equal(result?.engine, good.engine);
  assert.equal(JSON.stringify(provisional), before);
});

test("errors, malformed rows, stale dates and empty responses retain the provisional fallback", async () => {
  const cases = [answer({},503), answer(null), answer({...good,as_of:"2030-01-01"}), answer({...good,not_legal_advice:false}), answer({...good,results:[]}), answer({...good,results:[{}]}), answer({...good,results:[{...good.results[0],team_rule_id:"unknown"}]}), answer({...good,results:[good.results[0],good.results[0]]}), async () => {throw new Error("offline");}, async () => new Response("not json")];
  for (const fetch of cases) assert.equal(await liveEngine(resolver, rules, day, {env,fetch}), null);
  const expected = typedAddress(resolver,rules,resolver.query)!.results;
  const failed = await liveEngine(resolver,rules,day,{env,fetch:answer({},500)});
  assert.deepEqual(failed?.results ?? expected, expected);
});

test("deadline covers both connection and response-body waits", async () => {
  let signal: AbortSignal | null | undefined;
  const hanging: typeof fetch = (_url, init) => { signal = init?.signal; return new Promise(() => {}); };
  assert.equal(await liveEngine(resolver, rules, day, {env,fetch:hanging,timeoutMs:10}), null);
  assert.equal(signal?.aborted, true);
  const bodyHangs: typeof fetch = async () => new Response(new ReadableStream({start() {}}));
  assert.equal(await liveEngine(resolver, rules, day, {env,fetch:bodyHangs,timeoutMs:10}), null);
});

test("disabled/unconfigured engine and non-Census results never fetch", async () => {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => { calls++; throw new Error("must not fetch"); };
  for (const config of [{}, {...env,LIVE_ENGINE_DISABLED:"1"}]) assert.equal(await liveEngine(resolver,rules,day,{env:config,fetch}),null);
  assert.equal(await liveEngine({...resolver,source:"sample"},rules,day,{env,fetch}),null);
  assert.equal(await liveEngine({...resolver,coverage:"not_covered"},rules,day,{env,fetch}),null);
  assert.equal(calls,0);
});

test("endpoint uses server configuration and only sends preview bypass to this deployment", async () => {
  assert.equal(engineEndpoint({VERCEL_URL:"my-preview.vercel.app"}),"https://my-preview.vercel.app/api/engine");
  for (const origin of ["javascript:alert(1)","https://user:pass@example.org","https://example.org/path","https://example.org?token=x"]) assert.equal(engineEndpoint({LIVE_ENGINE_ORIGIN:origin}),null);
  const deployed = {VERCEL_URL:"my-preview.vercel.app",VERCEL_AUTOMATION_BYPASS_SECRET:"test-only"};
  await liveEngine(resolver,rules,day,{env:deployed,fetch:async (_url,init) => {
    assert.equal(new Headers(init?.headers).get("x-vercel-protection-bypass"),"test-only");
    return new Response(JSON.stringify(good));
  }});
  await liveEngine(resolver,rules,day,{env:{...deployed,...env},fetch:async (_url,init) => {
    assert.equal(new Headers(init?.headers).has("x-vercel-protection-bypass"),false);
    return new Response(JSON.stringify(good));
  }});
});
