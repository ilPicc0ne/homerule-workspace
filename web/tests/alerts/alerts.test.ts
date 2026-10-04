// Alerts: subscribe / confirm / unsubscribe / dispatch, with a fake Redis (memory store, and a fake Upstash REST
// endpoint for the Redis store) and a fake Resend. No real address, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { changes } from "../../lib/changes/data.ts";
import type { ChangesFile } from "../../lib/changes/types.ts";
import { confirmEmail } from "../../lib/alerts/confirm-email.ts";
import { describe, DispatchError, dispatchAlerts, resetSent, sourceAddresses, type DispatchDeps } from "../../lib/alerts/dispatch.ts";
import { closedTest, resendMailer, type Mailer, type Message } from "../../lib/alerts/mail.ts";
import { alertPreview } from "../../lib/alerts/preview.ts";
import { confirm, PREVIEW_TOKEN, RATE, subscribe, unsubscribe, type Deps } from "../../lib/alerts/service.ts";
import { memoryStore, redisStore, type Subscriber } from "../../lib/alerts/store.ts";
import { safeEqual } from "../../lib/alerts/unsub.ts";

const SITE = "https://example.test";
const DEMO = "demo-inbox@example.test";
const REAL = "real-renter@example.test";
const ADDR = "A0256";
const LABEL = "327 Jackson St, Hoboken, NJ";
const REAL_SRC = "asof:2026-10-01..2027-07-02";
const DEMO_SRC = "ingest:X001@2026-10-01";

function fakeMailer(fail = 0) {
  const sent: Message[] = [];
  let failures = fail;
  const m: Mailer & { sent: Message[] } = {
    sent,
    async send(msg) {
      if (failures > 0) {
        failures--;
        return { ok: false, error: "Resend 500" };
      }
      sent.push(msg);
      return { ok: true, id: `re_${sent.length}` };
    },
  };
  return m;
}

/** The built diff plus one demo-labelled source (a copy of the FAIR Act entry, labelled as fictional). */
function withDemo(): ChangesFile {
  const f = structuredClone(changes) as ChangesFile;
  const src = f.sources[REAL_SRC];
  f.sources[DEMO_SRC] = { ...src, kind: "ingest", title: "Fictional ordinance X001", demo_label: "Demo: fictional ordinance" };
  for (const id of src.affected_address_ids) {
    const rec = f.addresses[id];
    const e = rec?.entries.find((x) => x.source === REAL_SRC);
    if (e) rec.entries.push({ ...e, source: DEMO_SRC, kind: "ingest", demo_label: "Demo: fictional ordinance" });
  }
  return f;
}

/** A confirmed subscriber record; token "tok-<email>", flags as given. */
const rec = (email: string, address_id = ADDR, f: Partial<Subscriber> = {}): Subscriber => ({
  email, address_id, label: LABEL, confirmed_at: "x", token: `tok-${email}`, allowed: true, demo: false, ...f,
});

let clock = Date.parse("2026-10-04T10:00:00Z");
function deps(o: { allow?: string[]; mailer?: Mailer | null; closed?: boolean } = {}) {
  const store = memoryStore(() => clock);
  const mailer = o.mailer === undefined ? fakeMailer() : o.mailer;
  let n = 0;
  for (const e of o.allow ?? [DEMO, "renter@example.com"]) void store.allow(e);
  const d: Deps = {
    store,
    mailer,
    closed: o.closed ?? true,
    site: SITE,
    asOfText: "October 1, 2026",
    now: () => new Date(clock),
    newToken: () => `tok+/${++n}`,
  };
  return { d, store, mailer: mailer as ReturnType<typeof fakeMailer> };
}

const dd = (d: Deps, extra: Partial<DispatchDeps> = {}): DispatchDeps => ({ ...d, ...extra });
const input = { email: " Renter@Example.com ", addressId: ADDR, label: LABEL, ip: "1.2.3.4" };

// ── Tier B: double opt-in ─────────────────────────────────────────────────────────────────────────────────────

test("subscribe → pending (48 h) → confirm (POST page link) → sub:<address_id>", async () => {
  const { d, store, mailer } = deps();
  const r = await subscribe(input, d);
  assert.equal(r.status, "sent");
  assert.deepEqual(store.keys().filter((k) => k.startsWith("alerts:pending:")), ["alerts:pending:tok+/1"]);
  assert.equal(store.all().length, 0);
  const msg = mailer.sent[0];
  assert.equal(msg.to, "renter@example.com");
  assert.equal(msg.subject, "Confirm alerts for 327 Jackson St");
  assert.ok(msg.text.includes(`${SITE}/confirm?t=tok%2B%2F1`));                 // the confirm page, not a GET that confirms
  assert.match(msg.html, /Confirm alerts for 327 Jackson St/);
  assert.match(msg.html, /48 hours/);
  assert.match(msg.html, /We store your email and this address only/);
  assert.match(msg.html, /Didn.t ask for this\? Ignore this email/);
  assert.ok(r.preview && !r.preview.html.includes("tok%2B"));                  // the on-page preview never has the real token
  const sub = await confirm("tok+/1", d);
  assert.equal(sub?.email, "renter@example.com");
  assert.deepEqual(store.all().map((s) => [s.address_id, s.email, s.token, s.allowed, s.demo]), [[ADDR, "renter@example.com", "tok+/1", true, false]]);
  assert.equal(msg.headers["List-Unsubscribe"], `<${SITE}/api/unsubscribe?a=${ADDR}&t=tok%2B%2F1>`);   // works once confirmed
  assert.equal(await confirm("tok+/1", d), null);                               // used once
  assert.equal(await confirm(PREVIEW_TOKEN, d), null);
  // already subscribed: same answer, nothing sent (no enumeration)
  const again = await subscribe(input, d);
  assert.equal(again.status, "sent");
  assert.equal(mailer.sent.length, 1);
});

test("expired pending token (> 48 h) does not confirm", async () => {
  const { d, store } = deps();
  await subscribe(input, d);
  clock += 48 * 3600 * 1000 + 1;
  assert.equal(await confirm("tok+/1", d), null);
  assert.equal(store.all().length, 0);
});

test("closed test: email not allowed in the store → saved, nothing sent; no Resend key → not_configured; bad email → invalid", async () => {
  const a = deps({ allow: [DEMO] });
  assert.equal((await subscribe(input, a.d)).status, "closed_test");
  assert.equal(a.mailer.sent.length, 0);
  assert.equal((await subscribe(input, deps({ mailer: null }).d)).status, "not_configured");
  const c = deps();
  assert.equal((await subscribe({ ...input, email: "nope" }, c.d)).status, "invalid");
  assert.equal(c.store.keys().length, 0);
  // the closed test lasts while the postal address is a placeholder
  assert.equal(closedTest(), true);
  assert.equal(closedTest("1 Main St, Hoboken, NJ"), false);
});

test("rate limit per IP: the 6th signup in 10 minutes is refused, another IP is not", async () => {
  const { d } = deps();
  for (let i = 0; i < RATE.max; i++) assert.notEqual((await subscribe(input, d)).status, "rate_limited");
  assert.equal((await subscribe(input, d)).status, "rate_limited");
  assert.equal((await subscribe({ ...input, ip: "5.6.7.8" }, d)).status, "sent");
  clock += RATE.windowSec * 1000;
  assert.notEqual((await subscribe(input, d)).status, "rate_limited");
});

// ── Unsubscribe: the subscription token ─────────────────────────────────────────────────────────────────────────

test("token unsubscribe: the stored token removes exactly that subscriber; wrong token or address does nothing", async () => {
  const { d, store } = deps();
  await store.addSubscriber(rec("renter@example.com"));
  await store.addSubscriber(rec("other@example.com"));
  const t = "tok-renter@example.com";
  assert.equal(await unsubscribe(ADDR, "forged", d), null);
  assert.equal(await unsubscribe("A0001", t, d), null);
  assert.equal(await unsubscribe(ADDR, PREVIEW_TOKEN, d), null);
  assert.equal((await unsubscribe(ADDR, t, d))?.email, "renter@example.com");
  assert.deepEqual(store.all().map((s) => s.email), ["other@example.com"]);
  assert.equal(await unsubscribe(ADDR, t, d), null);                            // twice is fine
  assert.ok(safeEqual("abc", "abc") && !safeEqual("abc", "abcd"));
});

// ── Tier A: dispatch ──────────────────────────────────────────────────────────────────────────────────────────

test("dispatch sends once per subscriber; a second run sends nothing (sent: idempotency)", async () => {
  const { d, store, mailer } = deps();
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  const r1 = await dispatchAlerts(changes, REAL_SRC, dd(d));
  assert.equal(r1.counts.sent, 1);
  assert.equal(mailer.sent.length, 1);
  const m = mailer.sent[0];
  assert.equal(m.to, DEMO);
  const tok = `tok-${DEMO}`;
  assert.equal(m.headers["List-Unsubscribe"], `<${SITE}/api/unsubscribe?a=${ADDR}&t=${encodeURIComponent(tok)}>`);
  assert.ok(m.text.includes(`${SITE}/unsubscribe?a=${ADDR}&t=${encodeURIComponent(tok)}`));
  const r2 = await dispatchAlerts(changes, REAL_SRC, dd(d));
  assert.equal(r2.counts.already, 1);
  assert.equal(mailer.sent.length, 1);
  assert.ok(!describe(r1).includes(DEMO));                                      // emails masked in output
  assert.match(describe(r1), /d\*\*\*@example\.test/);
});

test("rehearse → reset → live sends exactly 1 again; reset only touches the demo inbox", async () => {
  const file = withDemo();
  const { d, store, mailer } = deps({ closed: false });
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  await store.addSubscriber(rec(REAL, ADDR, { allowed: false }));
  await dispatchAlerts(file, REAL_SRC, dd(d));                                  // a real source reached both
  assert.equal(mailer.sent.length, 2);
  await dispatchAlerts(file, DEMO_SRC, dd(d));                                  // rehearsal
  assert.equal(mailer.sent.length, 3);
  assert.equal((await dispatchAlerts(file, DEMO_SRC, dd(d))).counts.already, 1);
  const n = await resetSent(file, DEMO_SRC, store);
  assert.equal(n, 1);
  const live = await dispatchAlerts(file, DEMO_SRC, dd(d));                     // the live take
  assert.equal(live.counts.sent, 1);
  assert.equal(mailer.sent.length, 4);
  assert.equal((await dispatchAlerts(file, REAL_SRC, dd(d))).counts.already, 2);  // the real source's keys survive
});

test("a failed send writes no sent: key and is retried on the next run", async () => {
  const { d, store } = deps();
  const mailer = fakeMailer(1);
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  const r1 = await dispatchAlerts(changes, REAL_SRC, dd(d, { mailer }));
  assert.equal(r1.counts.failed, 1);
  assert.equal(r1.lines[0].detail, "Resend 500");
  assert.ok(!store.keys().some((k) => k.startsWith("alerts:sent:")));
  const r2 = await dispatchAlerts(changes, REAL_SRC, dd(d, { mailer }));
  assert.equal(r2.counts.sent, 1);
  assert.equal(mailer.sent.length, 1);
});

test("a demo-labelled source only mails subscribers flagged demo, even allowed ones are skipped, even after the closed test", async () => {
  const file = withDemo();
  for (const closed of [true, false]) {
    const { d, store, mailer } = deps({ closed, allow: [DEMO] });
    for (const id of sourceAddresses(file, DEMO_SRC).slice(0, 5)) await store.addSubscriber(rec(REAL, id, { allowed: true }));   // allowed, but not the demo inbox
    await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
    const r = await dispatchAlerts(file, DEMO_SRC, dd(d));
    assert.deepEqual(mailer.sent.map((m) => m.to), [DEMO]);
    assert.ok((r.counts.skipped_demo ?? 0) >= 1);
    assert.match(mailer.sent[0].subject, /^\[Demo: fictional ordinance\]/);
    assert.match(mailer.sent[0].html, /fictional test document, not real law/);
    // a real source: allowed subscribers get it (and after the closed test, everyone)
    const real = await dispatchAlerts(file, REAL_SRC, dd(d));
    assert.ok((real.counts.sent ?? 0) >= 2);
  }
});

test("dispatch: unknown source and missing Resend key are errors; dry run sends and writes nothing", async () => {
  const { d, store, mailer } = deps();
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  await assert.rejects(dispatchAlerts(changes, "nope", dd(d)), (e: DispatchError) => e.code === "unknown_source");
  await assert.rejects(dispatchAlerts(changes, REAL_SRC, dd(d, { mailer: null })), (e: DispatchError) => e.code === "not_configured");
  const dry = await dispatchAlerts(changes, REAL_SRC, dd(d, { mailer: null, dryRun: true }));
  assert.equal(dry.counts.would_send, 1);
  assert.equal(mailer.sent.length, 0);
  assert.ok(!store.keys().some((k) => k.startsWith("alerts:sent:")));
});

test("every alert: not legal advice, as-of date, unsubscribe link + List-Unsubscribe/-Post, text part, prototype notice", async () => {
  const { d, store, mailer } = deps();
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  await dispatchAlerts(changes, REAL_SRC, dd(d));
  const m = mailer.sent[0];
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(m.headers["List-Unsubscribe"], /^<https:\/\/example\.test\/api\/unsubscribe\?a=A0256&t=/);
  assert.ok(m.text.length > 100);
  for (const part of [m.text, m.html]) {
    assert.match(part, /Not legal advice/);
    assert.match(part, /October 1, 2026/);
    assert.match(part, /Unsubscribe/);
    assert.match(part, /Prototype built at a hackathon/);
    assert.doesNotMatch(part, /\b(compliant|illegal)\b/i);
  }
  // shared layout: warm white, ink buttons (not teal), Figtree, dark mode, preheader, 560 px
  assert.match(m.html, /#fdfcfa/);
  assert.match(m.html, /background:#2B3B4E/);
  assert.doesNotMatch(m.html, /#0f766e/i);
  assert.match(m.html, /family=Figtree/);
  assert.match(m.html, /prefers-color-scheme:dark/);
  assert.match(m.html, /max-width:560px/);
  assert.match(m.html, />HomeRule</);
});

test("closed test: real sources reach only subscribers flagged allowed", async () => {
  const { d, store, mailer } = deps({ closed: true });
  await store.addSubscriber(rec(DEMO, ADDR, { demo: true }));
  await store.addSubscriber(rec(REAL, ADDR, { allowed: false }));
  const r = await dispatchAlerts(changes, REAL_SRC, dd(d));
  assert.deepEqual(mailer.sent.map((m) => m.to), [DEMO]);
  assert.equal(r.counts.skipped_closed_test, 1);
});

// ── Plumbing ──────────────────────────────────────────────────────────────────────────────────────────────────

test("Redis store speaks the Upstash REST API (fake endpoint): pending TTL, hash per address, allowed set, sent keys, rate counter", async () => {
  const db = new Map<string, string>();
  const ttl = new Map<string, number>();
  const hashes = new Map<string, Map<string, string>>();
  const run = (c: (string | number)[]): unknown => {
    const [op, k, ...rest] = c.map(String);
    const h = () => hashes.get(k) ?? (hashes.set(k, new Map()), hashes.get(k)!);
    switch (op) {
      case "GET": return db.get(k) ?? null;
      case "SET": {
        if (rest.includes("NX") && db.has(k)) return null;
        db.set(k, rest[0]);
        const ex = rest.indexOf("EX");
        if (ex >= 0) ttl.set(k, Number(rest[ex + 1]));
        return "OK";
      }
      case "DEL": return [k, ...rest].filter((x) => db.delete(x)).length;
      case "EXISTS": return db.has(k) ? 1 : 0;
      case "INCR": db.set(k, String(Number(db.get(k) ?? 0) + 1)); return Number(db.get(k));
      case "HSET": h().set(rest[0], rest[1]); return 1;
      case "HGETALL": return [...h().entries()].flat();
      case "HDEL": return h().delete(rest[0]) ? 1 : 0;
      case "SADD": h().set(rest[0], "1"); return 1;
      case "SISMEMBER": return h().has(rest[0]) ? 1 : 0;
    }
    throw new Error(op);
  };
  const f = (async (url: string, init: RequestInit) => {
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer T");
    const body = JSON.parse(init.body as string);
    const out = url.endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) };
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  const s = redisStore("https://kv.test/", "T", f);
  await s.putPending("p1", { email: "a@x.com", address_id: ADDR, label: "L", created_at: "t" }, 172800);
  assert.equal(ttl.get("alerts:pending:p1"), 172800);
  assert.equal((await s.takePending("p1"))?.email, "a@x.com");
  assert.equal(await s.takePending("p1"), null);
  await s.addSubscriber(rec("a@x.com"));
  assert.equal(await s.isAllowed("a@x.com"), false);
  await s.allow("a@x.com");
  assert.equal(await s.isAllowed("a@x.com"), true);
  assert.deepEqual((await s.subscribers(ADDR)).map((x) => x.email), ["a@x.com"]);
  assert.deepEqual(await s.subscribers("A0001"), []);
  assert.equal(await s.removeSubscriber(ADDR, "a@x.com"), true);
  assert.equal(await s.isSent("alerts:sent:x"), false);
  await s.markSent("alerts:sent:x");
  assert.equal(await s.isSent("alerts:sent:x"), true);
  assert.equal(await s.clear(["alerts:sent:x", "alerts:sent:y"]), 1);
  assert.equal(await s.hit("alerts:rl:ip:1", 600), 1);
  assert.equal(await s.hit("alerts:rl:ip:1", 600), 2);
  assert.equal(ttl.get("alerts:rl:ip:1"), 600);
});

test("Resend mailer posts the message and reports errors (fake fetch)", async () => {
  let seen: { url: string; body: Record<string, unknown>; auth: string } | null = null;
  const ok = (async (url: string, init: RequestInit) => {
    seen = { url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).Authorization };
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  }) as typeof fetch;
  const m = confirmEmail({ to: "delivered@resend.dev", label: LABEL, addressId: ADDR, site: SITE, token: "t", unsubToken: "u", asOfText: "October 1, 2026" });
  assert.deepEqual(await resendMailer("K", ok).send(m), { ok: true, id: "re_1" });
  assert.equal(seen!.url, "https://api.resend.com/emails");
  assert.equal(seen!.auth, "Bearer K");
  assert.deepEqual(seen!.body.to, ["delivered@resend.dev"]);
  assert.ok((seen!.body.headers as Record<string, string>)["List-Unsubscribe-Post"]);
  await resendMailer("K", ok, "http://127.0.0.1:9/").send(m);
  assert.equal(seen!.url, "http://127.0.0.1:9/emails");
  const bad = (async () => new Response(JSON.stringify({ message: "nope" }), { status: 422 })) as unknown as typeof fetch;
  assert.deepEqual(await resendMailer("K", bad).send(m), { ok: false, error: "nope" });
});

test("example alert on the page: the address's own change, else a labelled sample; never a working token", () => {
  const own = alertPreview(changes, ADDR, SITE)!;
  assert.equal(own.sample, false);
  const none = alertPreview(changes, "A9999", SITE)!;
  assert.equal(none.sample, true);
  assert.match(none.subject, /^\[Example\]/);
  assert.match(none.html, /Example only/);
  for (const p of [own, none]) {
    assert.match(p.html, /Not legal advice/);
    assert.match(p.html, /t=preview-only/);
    assert.doesNotMatch(p.html, /\b(compliant|illegal|you should|we recommend|your rent is)\b/i);
  }
});
