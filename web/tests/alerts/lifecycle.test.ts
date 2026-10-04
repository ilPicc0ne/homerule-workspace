// Lifecycle alert engine: events per rule × subscribed address, daily digest, approval gate, corrections,
// idempotency, dry run, cron auth. Fake Redis (memory store; a fake Upstash endpoint for the new Redis commands),
// fake Resend, fake clock (each run's `now`). Fixture data only; no real address, no network.
import test from "node:test";
import assert from "node:assert/strict";
import type { Change, ChangesFile } from "../../lib/changes/types.ts";
import { handleCron } from "../../lib/alerts/cron.ts";
import { approveRule, runDaily, unapproveRule, type RunReport } from "../../lib/alerts/daily.ts";
import { calendar, localDate, startInfo, type LifeData, type LifeRule, type ListedRow } from "../../lib/alerts/lifecycle.ts";
import type { Mailer, Message } from "../../lib/alerts/mail.ts";
import { K, memoryStore, redisStore, type Subscriber } from "../../lib/alerts/store.ts";
import { emailHash } from "../../lib/alerts/unsub.ts";

const SITE = "https://example.test";
const NJ = "A9001"; // a New Jersey address
const CA = "A9002"; // a California address
const CA2 = "A9003"; // California, the ending rule only "may apply" there, no verdict in the diff
const NEW = "A9004"; // New Jersey, where a newly ingested document adds rules
const LABEL: Record<string, string> = {
  [NJ]: "1 Test St, Hoboken, NJ", [CA]: "2 Test Ave, San Diego, CA", [CA2]: "3 Test Rd, Los Angeles, CA", [NEW]: "4 Test Pl, Newark, NJ",
};

const rule = (id: string, j: string, category: string, f: Partial<LifeRule> = {}): LifeRule => ({
  rule_id: id, jurisdiction_id: j, category, title: `Title of ${id}`, summary: `Summary of ${id}.`, status: "in_force", effective_date: null, ...f,
});

const RULES: LifeRule[] = [
  rule("NJ-NEW", "NJ", "algorithmic_rent_setting", { status: "not_yet_effective", effective_date: "2027-07-01" }),
  rule("NJ-MONTH", "NJ", "security_deposits", { status: "not_yet_effective", effective_date: "2027-09-01", effective_precision: "month" }),
  rule("NJ-BILL", "NJ", "rent_increase_limits", { status: "pending" }),
  rule("CA-END", "CA", "rent_increase_limits", { effective_date: "2024-04-01", effective_until: "2030-01-01" }),
  rule("CA-JUL", "CA", "application_screening_fees", { status: "not_yet_effective", effective_date: "2027-07-01" }),
  rule("CA-DISP", "CA-SAN-DIEGO", "just_cause_eviction", {
    status: "not_yet_effective",
    effective_date: "2027-03-01",
    effective_dates_disputed: [{ date: "2027-01-01", source: "news" }, { date: "2027-03-01", source: "ordinance" }],
  }),
  rule("CA-SUPER", "CA", "just_cause_eviction", { effective_date: "2024-04-01", effective_until: "2030-01-01" }),
];

const LISTING: Record<string, ListedRow[]> = {
  [NJ]: [
    { rule_id: "NJ-NEW", result: "not_yet_effective", conflict_with: ["NJ-HOBOKEN-LOCAL"] },
    { rule_id: "NJ-MONTH", result: "not_yet_effective" },
    { rule_id: "NJ-BILL", result: "pending" },
  ],
  [CA]: [
    { rule_id: "CA-END", result: "applies" },
    { rule_id: "CA-JUL", result: "not_yet_effective" },
    { rule_id: "CA-DISP", result: "not_yet_effective" },
    { rule_id: "CA-SUPER", result: "superseded" },
  ],
  [CA2]: [{ rule_id: "CA-END", result: "unknown" }],
  [NEW]: [],
};

const change = (id: string, f: Partial<Change> & Record<string, unknown> = {}): Change => ({
  team_rule_id: id, change: "added", before: null, after: { result: "applies", conflict_flag: false, explanation: "x" }, result_changed: true,
  conflict_flag_changed: false, scored: false, title: `Title of ${id}`, citation: null, requirement_quote: "quote", source_url: null,
  effective_from: null, jurisdiction_id: "NJ", category: "algorithmic_rent_setting", document_status: "enacted", origin: "ingest", ...f,
});

const entry = (source: string, kind: "as_of" | "ingest", changes: Change[], demo_label: string | null = null) => ({
  source, kind, title: source, before_as_of: "2026-10-01", after_as_of: "2026-10-01", demo_label, changes,
});

function changesFile(): ChangesFile {
  return {
    as_of: "2026-10-01",
    not_legal_advice: true,
    sources: {},
    addresses: {
      [NEW]: {
        label: LABEL[NEW],
        jurisdictions: { state: "NJ" },
        entries: [
          entry("ingest:D900@2026-10-01", "ingest", [
            change("NJ-FOUND", { effective_from: "2027-02-01" }),
            change("NJ-BILL2", { document_status: "pending", after: { result: "pending", conflict_flag: false, explanation: "x" } }),
          ]),
          entry("ingest:X001@2026-10-01", "ingest", [change("NJ-DEMO", { effective_from: "2026-10-01" })], "Demo: fictional ordinance"),
        ],
      },
      [CA]: {
        label: LABEL[CA],
        jurisdictions: { state: "CA" },
        entries: [
          entry("asof:2029-12-31..2030-01-02", "as_of", [
            change("CA-END", { change: "removed", after: null, jurisdiction_id: "CA", category: "rent_increase_limits", effective_until: "2030-01-01", renter_impact: { verdict: "worse" } }),
          ]),
        ],
      },
    },
  };
}

function data(rules: LifeRule[] = RULES): LifeData {
  return { as_of: "2026-10-01", rules: new Map(rules.map((r) => [r.rule_id, r])), listing: (id) => LISTING[id] ?? null, changes: changesFile() };
}

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

const sub = (email: string, address_id: string, f: Partial<Subscriber> = {}): Subscriber => ({
  email, address_id, label: LABEL[address_id], confirmed_at: "2026-10-01T12:00:00Z", token: `tok-${email}-${address_id}`, allowed: true, demo: false, ...f,
});

/** 14:00 UTC: the cron's hour, after local midnight in both zones (07:00 in Los Angeles, 10:00 in New York). */
const at = (date: string, time = "14:00:00Z") => new Date(`${date}T${time}`);

function world(subs: Subscriber[], o: { fail?: number; closed?: boolean } = {}) {
  const store = memoryStore(() => Date.now());
  const mailer = fakeMailer(o.fail ?? 0);
  for (const s of subs) void store.addSubscriber(s);
  let d = data();
  const run = (date: string, extra: { dryRun?: boolean; now?: Date } = {}) =>
    runDaily(d, { store, mailer, closed: o.closed ?? true, site: SITE, now: extra.now ?? at(date), dryRun: extra.dryRun ?? false });
  return { store, mailer, run, setData: (x: LifeData) => (d = x) };
}

const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/** Runs every day in the range; returns "date trigger rule address" for every sent event. */
async function daily(run: (d: string) => Promise<RunReport>, from: string, to: string) {
  const sent: string[] = [];
  for (const day of days(from, to)) for (const l of (await run(day)).lines) if (l.outcome === "sent") sent.push(`${day} ${l.trigger} ${l.rule_id} ${l.address_id}`);
  return sent;
}

// ── Triggers ──────────────────────────────────────────────────────────────────────────────────────────────────

test("B takes effect: one alert 30 days before and one on the day, each sent once across daily runs", async () => {
  const w = world([sub("r@x.test", NJ)]);
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  const sent = await daily(w.run, "2027-05-25", "2027-07-06");
  assert.deepEqual(sent.filter((s) => s.includes("NJ-NEW")), [`2027-06-01 upcoming_30d NJ-NEW ${NJ}`, `2027-07-01 in_force NJ-NEW ${NJ}`]);
  const [first, second] = w.mailer.sent;
  assert.equal(first.subject, "Rule updates for 1 Test St");
  assert.match(first.text, /In 30 days · Software that sets rents — From July 1, 2027: Summary of NJ-NEW\./);
  assert.match(second.text, /Now in effect · Software that sets rents — Takes effect today, July 1, 2027: Summary of NJ-NEW\./);
  assert.match(first.text, /It may conflict with another rule on the same topic here; we don't decide that\./);   // flagged, never decided
  assert.match(first.text, new RegExp(`${SITE}/a/${NJ}`));
  assert.match(first.html, /See what this means for 1 Test St/);
  assert.match(first.text, /Not legal advice · data as of October 1, 2026/);
  assert.ok(!/\b(illegal|compliant|must|should|recommend|advise)\b/i.test(first.text));
});

test("C ends: 30 days before and on the day; minus badge from renter_impact, no badge when the diff has no verdict; superseded never", async () => {
  const w = world([sub("a@x.test", CA), sub("b@x.test", CA2)]);
  await approveRule(w.store, "CA-END", at("2026-10-02"));
  await approveRule(w.store, "CA-SUPER", at("2026-10-02"));
  const sent = await daily(w.run, "2029-11-28", "2030-01-03");
  assert.deepEqual(sent, [
    `2029-12-02 ending_30d CA-END ${CA}`,
    `2029-12-02 ending_30d CA-END ${CA2}`,
    `2030-01-01 ended CA-END ${CA}`,
    `2030-01-01 ended CA-END ${CA2}`,
  ]);
  const toA = w.mailer.sent.filter((m) => m.to === "a@x.test");
  const toB = w.mailer.sent.filter((m) => m.to === "b@x.test");
  assert.match(toA[0].text, /Ends in 30 days · Rent increases · − This change narrows renter protection — On January 1, 2030 this rule stops applying/);
  assert.match(toA[0].html, /− This change narrows renter protection/);
  assert.match(toA[1].text, /Ended · Rent increases · − This change narrows/);
  assert.ok(!toB[0].text.includes("renter protection"));
});

test("today is the jurisdiction's local date: 05:00 UTC on July 1 is July 1 in New York, still June 30 in Los Angeles", async () => {
  assert.equal(localDate(at("2027-07-01", "05:00:00Z"), "America/New_York"), "2027-07-01");
  assert.equal(localDate(at("2027-07-01", "05:00:00Z"), "America/Los_Angeles"), "2027-06-30");
  const w = world([sub("ny@x.test", NJ), sub("la@x.test", CA)]);
  for (const r of ["NJ-NEW", "CA-JUL"]) await approveRule(w.store, r, at("2026-10-02"));
  const early = await w.run("2027-07-01", { now: at("2027-07-01", "05:00:00Z") });
  assert.deepEqual(early.lines.filter((l) => l.outcome === "sent").map((l) => `${l.trigger} ${l.rule_id}`), ["in_force NJ-NEW"]);
  const later = await w.run("2027-07-01", { now: at("2027-07-01", "14:00:00Z") });
  assert.deepEqual(later.lines.filter((l) => l.outcome === "sent").map((l) => `${l.trigger} ${l.rule_id}`), ["in_force CA-JUL"]);
});

test("month precision and conflicting dates: no day-exact reminder, the date in words as the data gives it", async () => {
  const cal = calendar(data(), NJ).filter((e) => e.rule_id === "NJ-MONTH");
  assert.deepEqual(cal.map((e) => [e.trigger, e.fire_date]), [["upcoming_30d", "2027-08-02"]]);  // window start Sep 1 − 30 days
  assert.deepEqual(startInfo({ effective_date: "2027-09-01", effective_precision: "year" }), { anchor: "2027-01-01", precision: "year", when: "in 2027" });
  const disp = calendar(data(), CA).filter((e) => e.rule_id === "CA-DISP");
  assert.deepEqual(disp.map((e) => [e.trigger, e.fire_date]), [["upcoming_30d", "2026-12-02"]]);  // earliest claim − 30 days

  const w = world([sub("r@x.test", NJ), sub("r@x.test", CA)]);
  for (const r of ["NJ-MONTH", "CA-DISP"]) await approveRule(w.store, r, at("2026-10-02"));
  const sent = await daily(w.run, "2026-11-25", "2027-03-05");
  assert.deepEqual(sent, [`2026-12-02 upcoming_30d CA-DISP ${CA}`]);
  assert.match(w.mailer.sent[0].text, /Coming soon · Eviction — Takes effect on a date sources disagree on \(January 1, 2027 or March 1, 2027\)/);
  const month = await daily(w.run, "2027-08-01", "2027-09-05");
  assert.deepEqual(month, [`2027-08-02 upcoming_30d NJ-MONTH ${NJ}`]);
  const text = w.mailer.sent[1].text;
  assert.match(text, /Coming in September 2027 · Security deposit — Takes effect in September 2027 \(the law gives no exact day\)/);
  assert.ok(!/September 1, 2027|Sep 1, 2027/.test(text));
});

test("pending bills and superseded rows never fire", () => {
  const all = [NJ, CA, CA2, NEW].flatMap((a) => calendar(data(), a));
  assert.ok(!all.some((e) => ["NJ-BILL", "NJ-BILL2", "CA-SUPER"].includes(e.rule_id)));
});

// ── Digest, approval, discovery, corrections ────────────────────────────────────────────────────────────────

test("digest: one email per subscriber per day across all their addresses and events", async () => {
  const w = world([sub("r@x.test", NJ), sub("r@x.test", CA), sub("other@x.test", NJ)]);
  for (const r of ["NJ-NEW", "CA-JUL"]) await approveRule(w.store, r, at("2026-10-02"));
  const r = await w.run("2027-06-01");
  assert.equal(w.mailer.sent.length, 2);
  const mine = w.mailer.sent.find((m) => m.to === "r@x.test")!;
  assert.equal(mine.subject, "Rule updates for 1 Test St and 1 other address");
  assert.match(mine.text, /1 Test St, Hoboken, NJ\n• In 30 days · Software that sets rents/);
  assert.match(mine.text, /2 Test Ave, San Diego, CA\n• In 30 days · Application fees/);
  assert.ok(mine.text.includes(`${SITE}/unsubscribe?a=${NJ}&t=tok-r%40x.test-${NJ}`));
  assert.ok(mine.text.includes(`${SITE}/unsubscribe?a=${CA}&t=tok-r%40x.test-${CA}`));
  assert.equal(mine.headers["List-Unsubscribe"], `<${SITE}/api/unsubscribe?a=${NJ}&t=tok-r%40x.test-${NJ}>`);
  assert.equal(r.digests.length, 2);
  assert.deepEqual(r.counts, { sent: 3 });
});

test("approval gate: an unapproved rule is queued (nothing sent), approving it sends on the next run within the catch-up window", async () => {
  const w = world([sub("r@x.test", NJ)]);
  const r1 = await w.run("2027-06-01");
  assert.equal(w.mailer.sent.length, 0);
  assert.deepEqual(r1.queued_rules, ["NJ-NEW"]);
  assert.deepEqual(r1.lines.map((l) => [l.trigger, l.outcome]), [["upcoming_30d", "queued"]]);
  await approveRule(w.store, "NJ-NEW", at("2027-06-02"));
  const r2 = await w.run("2027-06-02");
  assert.deepEqual(r2.lines.map((l) => [l.trigger, l.outcome]), [["upcoming_30d", "sent"]]);
  assert.equal(await unapproveRule(w.store, "NJ-NEW"), true);
  assert.equal(await w.store.get(K.approved("NJ-NEW")), null);
  // past the catch-up window (3 days) a due event is dropped, never sent late
  const w2 = world([sub("r@x.test", NJ)]);
  await approveRule(w2.store, "NJ-NEW", at("2027-06-05"));
  assert.equal((await w2.run("2027-06-05")).lines.length, 0);
});

test("discovered: a newly found enacted law goes out once after approval; pending never; demo only to the demo inbox; later subscribers don't get it", async () => {
  const w = world([sub("r@x.test", NEW), sub("demo@x.test", NEW, { demo: true }), sub("late@x.test", NEW, { confirmed_at: "2026-10-09T00:00:00Z" })]);
  await approveRule(w.store, "NJ-FOUND", at("2026-10-05"));
  await approveRule(w.store, "NJ-DEMO", at("2026-10-05"));
  const r = await w.run("2026-10-05");
  const got = (to: string) => r.lines.filter((l) => l.to === to).map((l) => `${l.trigger} ${l.rule_id} ${l.outcome}`).sort();
  assert.deepEqual(got("r***@x.test"), ["discovered NJ-DEMO skipped_demo", "discovered NJ-FOUND sent"]);
  assert.deepEqual(got("d***@x.test"), ["discovered NJ-DEMO sent", "discovered NJ-FOUND sent"]);
  assert.deepEqual(got("l***@x.test"), ["discovered NJ-DEMO skipped_demo"]);
  assert.ok(!r.lines.some((l) => l.rule_id === "NJ-BILL2"));
  const real = w.mailer.sent.find((m) => m.to === "r@x.test")!;
  assert.match(real.text, /New law · Software that sets rents — Title of NJ-FOUND\. It takes effect on February 1, 2027\./);
  const demo = w.mailer.sent.find((m) => m.to === "demo@x.test")!;
  assert.match(demo.subject, /^\[Demo: fictional ordinance\] /);
  // told once: the next run sends nothing
  assert.equal((await w.run("2026-10-06")).lines.filter((l) => l.outcome === "sent").length, 0);
});

test("correction: a sent date that moves in the data gets one correction in the next digest, shown next to the new date's alert", async () => {
  const w = world([sub("r@x.test", NJ)]);
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  await w.run("2027-06-01");
  assert.equal(w.mailer.sent.length, 1);
  // the law now starts on July 2: the correction and the new 30-day reminder fall on the same run, both show
  w.setData(data(RULES.map((r) => (r.rule_id === "NJ-NEW" ? { ...r, effective_date: "2027-07-02" } : r))));
  const r = await w.run("2027-06-02");
  assert.deepEqual(r.lines.filter((l) => l.outcome === "sent").map((l) => l.trigger).sort(), ["correction", "upcoming_30d"]);
  const m = w.mailer.sent[1];
  assert.equal(m.subject, "Correction and rule updates for 1 Test St");
  assert.match(m.text, /• Correction · Software that sets rents — We wrote that "Title of NJ-NEW" takes effect on July 1, 2027\. The date in our data is now July 2, 2027\./);
  assert.match(m.text, /• In 30 days · Software that sets rents — From July 2, 2027: Summary of NJ-NEW\./);
  assert.equal((await w.run("2027-06-03")).lines.filter((l) => l.outcome === "sent").length, 0);
  const sent = await daily(w.run, "2027-06-04", "2027-07-05");
  assert.deepEqual(sent, [`2027-07-02 in_force NJ-NEW ${NJ}`]);
  // withdrawn: the rule leaves the data → one correction, then silence
  w.setData(data(RULES.filter((x) => x.rule_id !== "NJ-NEW")));
  const gone = await w.run("2027-07-20");
  assert.deepEqual(gone.lines.map((l) => [l.trigger, l.outcome]), [["correction", "sent"]]);
  assert.match(w.mailer.sent.at(-1)!.text, /Our data no longer shows this rule for this address/);
  assert.equal((await w.run("2027-07-21")).lines.length, 0);
});

test("one digest per email per day: a second run that day defers new events; the next day's mail words them from that day", async () => {
  const w = world([sub("r@x.test", NJ), sub("r@x.test", CA)]);
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  assert.deepEqual((await w.run("2027-06-01")).counts, { sent: 1, queued: 1 });
  await approveRule(w.store, "CA-JUL", at("2027-06-01"));
  const again = await w.run("2027-06-01");
  assert.deepEqual(again.lines.filter((l) => l.outcome !== "already").map((l) => [l.rule_id, l.outcome]), [["CA-JUL", "deferred"]]);
  assert.equal(w.mailer.sent.length, 1);
  const next = await w.run("2027-06-02");
  assert.deepEqual(next.lines.filter((l) => l.outcome === "sent").map((l) => l.rule_id), ["CA-JUL"]);
  assert.match(w.mailer.sent[1].text, /In 29 days · Application fees — From July 1, 2027:/);
});

// ── Idempotency, dry run, closed test ───────────────────────────────────────────────────────────────────────

test("idempotency and retry: a failed send writes nothing and is retried next run; a sent event never goes twice", async () => {
  const w = world([sub("r@x.test", NJ)], { fail: 1 });
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  const r1 = await w.run("2027-06-01");
  assert.deepEqual(r1.lines.map((l) => l.outcome), ["failed"]);
  assert.equal(await w.store.isSent(K.sentEvent(`NJ-NEW|${NJ}|upcoming_30d|2027-07-01`, emailHash("r@x.test"))), false);
  assert.deepEqual(await w.store.hgetall(K.told(emailHash("r@x.test"))), {});
  const r2 = await w.run("2027-06-02");
  assert.deepEqual(r2.lines.map((l) => l.outcome), ["sent"]);
  assert.equal(await w.store.isSent(K.sentEvent(`NJ-NEW|${NJ}|upcoming_30d|2027-07-01`, emailHash("r@x.test"))), true);
  assert.deepEqual((await w.run("2027-06-02")).lines.map((l) => l.outcome), ["already"]);
  assert.deepEqual((await w.run("2027-06-03")).lines.map((l) => l.outcome), ["already"]);
  assert.equal(w.mailer.sent.length, 1);
});

test("dry run: lists what would go, never sends, never writes", async () => {
  const w = world([sub("r@x.test", NJ), sub("r@x.test", CA)]);
  for (const r of ["NJ-NEW", "CA-JUL"]) await approveRule(w.store, r, at("2026-10-02"));
  const before = w.store.keys();
  const r = await w.run("2027-06-01", { dryRun: true });
  assert.equal(w.mailer.sent.length, 0);
  assert.deepEqual(w.store.keys(), before);
  assert.deepEqual(await w.store.hgetall(K.told(emailHash("r@x.test"))), {});
  assert.deepEqual(r.counts, { would_send: 2 });
  assert.equal(r.digests.length, 1);
  assert.equal(r.digests[0].subject, "Rule updates for 1 Test St and 1 other address");
  assert.equal(r.dry_run, true);
  // a real run afterwards still sends (the dry run used nothing up)
  assert.deepEqual((await w.run("2027-06-01")).counts, { sent: 2 });
});

test("closed test: subscribers not flagged allowed are skipped, the demo rule is unchanged", async () => {
  const w = world([sub("r@x.test", NJ, { allowed: false })]);
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  assert.deepEqual((await w.run("2027-06-01")).lines.map((l) => l.outcome), ["skipped_closed_test"]);
  const open = world([sub("r@x.test", NJ, { allowed: false })], { closed: false });
  await approveRule(open.store, "NJ-NEW", at("2026-10-02"));
  assert.deepEqual((await open.run("2027-06-01")).lines.map((l) => l.outcome), ["sent"]);
});

// ── Cron route ──────────────────────────────────────────────────────────────────────────────────────────────

test("cron route: Bearer CRON_SECRET or DEMO_TOKEN only; dry run unless ALERTS_CRON_SEND=1; a simulated date is always dry", async () => {
  const w = world([sub("r@x.test", NJ)]);
  await approveRule(w.store, "NJ-NEW", at("2026-10-02"));
  const deps = () => ({ store: w.store, mailer: w.mailer, data: data(), closed: true, now: at("2027-06-01") });
  const call = (env: Record<string, string>, auth?: string, q = "") =>
    handleCron(new Request(`${SITE}/api/alerts/cron${q}`, { headers: auth ? { authorization: `Bearer ${auth}` } : {} }), env, deps);
  const env = { CRON_SECRET: "cron-s", DEMO_TOKEN: "demo-t" };
  assert.equal((await call(env)).status, 401);
  assert.equal((await call(env, "wrong")).status, 401);
  assert.equal((await call({}, "anything")).status, 401);
  assert.equal((await call(env, "demo-t", "?date=2027-6-1")).status, 400);

  const dry = await call(env, "cron-s");
  assert.equal(dry.status, 200);
  const j = (await dry.json()) as RunReport;
  assert.equal(j.dry_run, true);
  assert.deepEqual(j.counts, { would_send: 1 });
  assert.equal(w.mailer.sent.length, 0);
  assert.equal(((await (await call(env, "demo-t")).json()) as RunReport).dry_run, true);

  const sim = (await (await call({ ...env, ALERTS_CRON_SEND: "1" }, "cron-s", "?date=2027-07-01")).json()) as RunReport;
  assert.deepEqual([sim.dry_run, sim.simulated, sim.counts], [true, "2027-07-01", { would_send: 1 }]);
  assert.equal(w.mailer.sent.length, 0);

  const live = (await (await call({ ...env, ALERTS_CRON_SEND: "1" }, "cron-s")).json()) as RunReport;
  assert.deepEqual([live.dry_run, live.counts], [false, { sent: 1 }]);
  assert.equal(w.mailer.sent.length, 1);
  assert.equal((await handleCron(new Request(`${SITE}/api/alerts/cron`, { headers: { authorization: "Bearer cron-s" } }), env, () => ({ ...deps(), store: null }))).status, 503);
});

test("Redis store: SCAN over sub:* (paged), GET/SET with expiry, told hash, sent TTL", async () => {
  const db = new Map<string, string>();
  const ttl = new Map<string, number>();
  const hashes = new Map<string, Map<string, string>>();
  const run = (c: (string | number)[]): unknown => {
    const [op, k, ...rest] = c.map(String);
    const h = () => hashes.get(k) ?? (hashes.set(k, new Map()), hashes.get(k)!);
    switch (op) {
      case "GET": return db.get(k) ?? null;
      case "SET": {
        db.set(k, rest[0]);
        const ex = rest.indexOf("EX");
        if (ex >= 0) ttl.set(k, Number(rest[ex + 1]));
        return "OK";
      }
      case "HSET": h().set(rest[0], rest[1]); return 1;
      case "HGETALL": return [...h().entries()].flat();
      case "HDEL": return h().delete(rest[0]) ? 1 : 0;
      case "SCAN": {
        assert.deepEqual(rest, ["MATCH", "alerts:sub:*", "COUNT", "500"]);
        const keys = [...hashes.keys()].filter((x) => x.startsWith("alerts:sub:")).sort();
        return k === "0" ? ["7", keys.slice(0, 1)] : ["0", keys.slice(1)];  // two pages
      }
    }
    throw new Error(op);
  };
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return new Response(JSON.stringify(url.endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) }), { status: 200 });
  }) as typeof fetch;
  const s = redisStore("https://kv.test/", "T", f);
  await s.addSubscriber(sub("a@x.test", NJ));
  await s.addSubscriber(sub("b@x.test", CA));
  assert.deepEqual(await s.subscribedAddresses(), [NJ, CA].sort());
  await approveRule(s, "NJ-NEW", at("2026-10-02"));
  assert.equal(JSON.parse((await s.get(K.approved("NJ-NEW")))!).at, "2026-10-02T14:00:00.000Z");
  assert.equal(ttl.has(K.approved("NJ-NEW")), false);                         // approvals don't expire
  await s.hset(K.told("h"), "f", "v");
  assert.deepEqual(await s.hgetall(K.told("h")), { f: "v" });
  await s.hdel(K.told("h"), "f");
  assert.deepEqual(await s.hgetall(K.told("h")), {});
  await s.markSent("alerts:sent:e:h", 123);
  assert.equal(ttl.get("alerts:sent:e:h"), 123);
});
