// Alerts: subscribe / confirm / unsubscribe / allowlist / notify dry run, with a mocked Redis and a mocked Resend.
import test from "node:test";
import assert from "node:assert/strict";
import { changes } from "../../lib/changes/data.ts";
import { confirmEmail } from "../../lib/alerts/confirm-email.ts";
import { allowlist, resendMailer, type Mailer, type Message } from "../../lib/alerts/mail.ts";
import { describe, plan, send } from "../../lib/alerts/notify.ts";
import { alertPreview } from "../../lib/alerts/preview.ts";
import { confirm, PREVIEW_TOKEN, subscribe, unsubscribe, type Deps } from "../../lib/alerts/service.ts";
import { memoryStore, redisStore, type Subscription } from "../../lib/alerts/store.ts";

const SITE = "https://example.test";

function fakeMailer() {
  const sent: Message[] = [];
  const m: Mailer & { sent: Message[] } = { sent, send: async (msg) => (sent.push(msg), { ok: true, id: `id${sent.length}` }) };
  return m;
}

function deps(allow: string[] = [], mailer: Mailer | null = fakeMailer()) {
  const store = memoryStore();
  let n = 0;
  const d: Deps = { store, mailer, allow: new Set(allow), site: SITE, asOfText: "October 1, 2026", newToken: () => `tok+/${++n}` };
  return { d, store, mailer };
}

const input = { email: " Renter@Example.com ", addressId: "A0256", label: "327 Jackson St, Hoboken, NJ" };

test("allowlisted: saved pending, confirmation email sent with encoded confirm + unsubscribe links", async () => {
  const { d, store, mailer } = deps(["renter@example.com"]);
  const r = await subscribe(input, d);
  assert.equal(r.status, "sent");
  const [sub] = store.all();
  assert.equal(sub.status, "pending");
  assert.equal(sub.email, "renter@example.com");
  assert.ok(sub.created_at);
  const msg = (mailer as ReturnType<typeof fakeMailer>).sent[0];
  assert.equal(msg.to, "renter@example.com");
  assert.equal(msg.from, "HomeRule <alerts@yourhomerule.com>");
  assert.ok(msg.text.includes(`${SITE}/api/confirm?token=tok%2B%2F1`));
  assert.equal(msg.headers["List-Unsubscribe"], `<${SITE}/api/unsubscribe?token=tok%2B%2F1>`);
  for (const part of [msg.text, msg.html]) {
    assert.match(part, /Not legal advice/);
    assert.match(part, /October 1, 2026/);
    assert.match(part, /Prototype built at a hackathon/);
  }
  // the on-page preview never carries the real token
  assert.ok(r.preview && !r.preview.html.includes("tok%2B"));
  assert.ok(r.preview.html.includes(PREVIEW_TOKEN));
});

test("not on the allowlist: saved as pending, nothing sent, closed test", async () => {
  const { d, store, mailer } = deps(["someone@else.com"]);
  const r = await subscribe(input, d);
  assert.equal(r.status, "closed_test");
  assert.equal((mailer as ReturnType<typeof fakeMailer>).sent.length, 0);
  assert.equal(store.all()[0].status, "pending");
  assert.equal(store.all()[0].allowlisted, false);
  assert.ok(r.preview);
});

test("allowlisted but no Resend key: saved, not_configured", async () => {
  const { d } = deps(["renter@example.com"], null);
  assert.equal((await subscribe(input, d)).status, "not_configured");
});

test("invalid email is refused and nothing is stored", async () => {
  const { d, store } = deps();
  assert.equal((await subscribe({ ...input, email: "nope" }, d)).status, "invalid");
  assert.equal(store.all().length, 0);
});

test("confirm, repeat signup, unsubscribe", async () => {
  const { d, store } = deps(["renter@example.com"]);
  await subscribe(input, d);
  await subscribe(input, d);                                     // a second pending signup reuses the token
  assert.equal(store.all().length, 1);
  const tok = store.all()[0].token;
  assert.equal(await confirm("wrong", d), null);
  assert.equal(await confirm(PREVIEW_TOKEN, d), null);           // the preview link never confirms
  const c = await confirm(tok, d);
  assert.equal(c?.status, "confirmed");
  assert.ok(c?.confirmed_at);
  assert.equal((await d.store.confirmed()).length, 1);
  assert.equal((await subscribe(input, d)).status, "already");
  assert.equal((await unsubscribe(tok, d))?.token, tok);
  assert.equal(store.all().length, 0);
  assert.equal(await unsubscribe(tok, d), null);
});

test("allowlist env: comma-separated, trimmed, case-insensitive", () => {
  assert.deepEqual([...allowlist({ ALERTS_ALLOWLIST: " A@x.com, b@y.org ,," } as unknown as NodeJS.ProcessEnv)], ["a@x.com", "b@y.org"]);
  assert.equal(allowlist({} as unknown as NodeJS.ProcessEnv).size, 0);
});

test("Redis store speaks the Upstash REST API (mocked fetch)", async () => {
  const db = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const run = (c: string[]): unknown => {
    const [op, k, ...rest] = c;
    const set = () => sets.get(k) ?? (sets.set(k, new Set()), sets.get(k)!);
    switch (op) {
      case "GET": return db.get(k) ?? null;
      case "SET": db.set(k, rest[0]); return "OK";
      case "DEL": return db.delete(k) ? 1 : 0;
      case "SADD": set().add(rest[0]); return 1;
      case "SREM": set().delete(rest[0]); return 1;
      case "SMEMBERS": return [...set()];
      case "MGET": return [k, ...rest].map((x) => db.get(x) ?? null);
    }
    throw new Error(op);
  };
  const calls: string[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer T");
    const body = JSON.parse(init.body as string);
    const out = url.endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) };
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  const s = redisStore("https://kv.test/", "T", f);
  const sub: Subscription = { token: "t1", email: "a@x.com", address_id: "A0256", label: "L", status: "pending", created_at: "2026-10-04T00:00:00Z", confirmed_at: null, allowlisted: true };
  await s.save(sub);
  assert.equal(await s.tokenFor("A@x.com", "A0256"), "t1");
  assert.deepEqual(await s.confirmed(), []);
  await s.save({ ...sub, status: "confirmed", confirmed_at: "x" });
  assert.equal((await s.confirmed())[0].token, "t1");
  assert.ok(!sets.get("alerts:pending")!.has("t1"));
  assert.equal((await s.remove("t1"))?.email, "a@x.com");
  assert.equal(await s.get("t1"), null);
  assert.ok(calls.some((u) => u === "https://kv.test/pipeline"));
});

test("Resend mailer posts the message and reports errors (mocked fetch)", async () => {
  let seen: { url: string; body: Record<string, unknown>; auth: string } | null = null;
  const ok = (async (url: string, init: RequestInit) => {
    seen = { url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).Authorization };
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  }) as typeof fetch;
  const m = confirmEmail({ to: "delivered@resend.dev", label: "L", site: SITE, token: "t", asOfText: "October 1, 2026" });
  assert.deepEqual(await resendMailer("K", ok).send(m), { ok: true, id: "re_1" });
  assert.equal(seen!.url, "https://api.resend.com/emails");
  assert.equal(seen!.auth, "Bearer K");
  assert.deepEqual(seen!.body.to, ["delivered@resend.dev"]);
  assert.ok((seen!.body.headers as Record<string, string>)["List-Unsubscribe"]);
  const bad = (async () => new Response(JSON.stringify({ message: "nope" }), { status: 422 })) as unknown as typeof fetch;
  assert.deepEqual(await resendMailer("K", bad).send(m), { ok: false, error: "nope" });
});

test("notify dry run: confirmed subscribers with a change, rendered with their own token; sends allowlisted only", async () => {
  const base = { email: "", label: "", created_at: "", confirmed_at: "x", allowlisted: true };
  const subs: Subscription[] = [
    { ...base, token: "c1", email: "delivered@resend.dev", address_id: "A0256", status: "confirmed" },
    { ...base, token: "c2", email: "other@x.com", address_id: "A0256", status: "confirmed" },
    { ...base, token: "p1", email: "p@x.com", address_id: "A0256", status: "pending" },
    { ...base, token: "n1", email: "n@x.com", address_id: "NOPE", status: "confirmed" },
  ];
  const p = plan(subs, changes, { site: SITE, allow: new Set(["delivered@resend.dev"]) });
  assert.deepEqual(p.map((x) => x.sub.token), ["c1", "c2"]);
  assert.equal(p[0].email.unsubscribe_url, `${SITE}/api/unsubscribe?token=c1`);
  const out = describe(p);
  assert.match(out, /to delivered@resend\.dev/);
  assert.match(out, /NOT ON ALERTS_ALLOWLIST.*other@x\.com/);
  assert.match(out, /Not legal advice/);
  const mailer = fakeMailer();
  const lines = await send(p, mailer);
  assert.deepEqual(mailer.sent.map((m) => m.to), ["delivered@resend.dev"]);
  assert.match(lines[1], /skipped other@x\.com/);
  assert.match(describe([]), /Nothing to send/);
});

test("example alert: the address's own change, else a labelled sample; never a working token", () => {
  const own = alertPreview(changes, "A0256", SITE)!;
  assert.equal(own.sample, false);
  const none = Object.keys(changes.addresses).includes("A9999") ? null : alertPreview(changes, "A9999", SITE)!;
  assert.equal(none!.sample, true);
  assert.match(none!.subject, /^\[Example\]/);
  assert.match(none!.html, /Example only/);
  for (const p of [own, none!]) {
    assert.match(p.html, /Not legal advice/);
    assert.match(p.html, /token=preview-only/);
    assert.doesNotMatch(p.html, /\b(compliant|illegal|you should|we recommend|your rent is)\b/i);
  }
});
