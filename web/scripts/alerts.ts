// Change alerts from the command line. Reads KV_* / RESEND_API_KEY / DEMO_TOKEN / DEMO_INBOX from env
// (.env.local via `npx vercel env pull web/.env.local`). Emails are masked in all output; no address is ever in the repo.
//
//   seed [--demo] [<email>] <address_id...>    confirmed, allowed subscriber at these IDs; --demo also flags it as the
//                                              demo inbox (the only recipient of fictional sources). Email from the
//                                              argument or DEMO_INBOX in .env.local
//   notify [--source S] [--send] [--changes P]  local run of dispatchAlerts on a changes file; dry run unless --send
//                                              (no DEMO_TOKEN needed: talks to Redis and Resend directly)
//   reset <source> [--changes P]                clear the source's sent: keys for demo-flagged subscribers (between rehearsals)
//   trigger <source> [--url U] [--wait S]      POST /api/alerts/dispatch on the deployed site (default ALERTS_SITE_URL or
//                                              https://yourhomerule.com), retrying until that deploy has the source
// Lifecycle engine (lib/alerts/daily.ts; the daily cron runs the same function):
//   run [--date D] [--send] [--verbose]        events due today (or on simulated local date D) → one digest per
//                                              subscriber; dry run unless --send
//   run --simulate all|<id,...> [--approve-all] [--date D]
//                                              same over the real data with one fake subscriber per address in a
//                                              memory store (no Redis, never sends); --approve-all approves every rule
//   approve <rule_id...> | unapprove <rule_id...>
//                                              the once-per-rule approval gate (alerts:approved:<rule_id>)
import { readFileSync } from "node:fs";
import { SITE } from "../lib/changes/email.ts";
import type { ChangesFile } from "../lib/changes/types.ts";
import { closedTest, isEmail, mailerFromEnv, normEmail } from "../lib/alerts/mail.ts";
import { describe, dispatchAlerts, resetSent, sourceAddresses, type DispatchReport } from "../lib/alerts/dispatch.ts";
import { memoryStore, storeFromEnv } from "../lib/alerts/store.ts";
import { maskEmail, newToken } from "../lib/alerts/unsub.ts";
import { approveRule, describeRun, runDaily, unapproveRule } from "../lib/alerts/daily.ts";
import { isIsoDate, lifeDataFrom, type LifeData } from "../lib/alerts/lifecycle.ts";

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = ["--source", "--changes", "--url", "--wait", "--date", "--simulate"];
const positional = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};
const site = process.env.ALERTS_SITE_URL || SITE;
const loadChanges = () => JSON.parse(readFileSync(flag("--changes") ?? "data/changes.full.json", "utf8")) as ChangesFile;
const needStore = () => storeFromEnv() ?? die("No KV_REST_API_URL / KV_REST_API_TOKEN. Run `npx vercel env pull web/.env.local` from the repo root.");
type Addr = { address_id: string; street: string; postal_city: string; state_code: string };
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const liveData = (): LifeData =>
  lifeDataFrom({ meta: readJson("data/live/meta.json"), rules: readJson("data/live/rules.json"), lookups: readJson("data/live/lookups.json") }, loadChanges());

if (cmd === "seed") {
  const demo = args.includes("--demo");
  const email = normEmail(positional.find((x) => x.includes("@")) ?? process.env.DEMO_INBOX ?? "");
  const ids = positional.filter((x) => !x.includes("@"));
  if (!isEmail(email) || !ids.length) die("Usage: npm run seed-subscriber -- [--demo] [<email>] <address_id> [...]  (email from the argument or DEMO_INBOX in .env.local)");
  const store = needStore();
  const known = JSON.parse(readFileSync("data/live/addresses.json", "utf8")) as { address_id: string; street: string; postal_city: string; state_code: string }[];
  await store.allow(email);
  for (const id of ids) {
    const a = known.find((x) => x.address_id === id) ?? die(`Unknown address ${id}.`);
    const label = `${a.street}, ${a.postal_city}, ${a.state_code}`;
    const old = (await store.subscribers(id)).find((s) => s.email === email);
    await store.addSubscriber({ email, address_id: id, label, confirmed_at: new Date().toISOString(), token: old?.token ?? newToken(), allowed: true, demo });
    console.log(`subscribed ${maskEmail(email)} to ${id} (${label})${demo ? " [demo inbox]" : ""}`);
  }
} else if (cmd === "notify") {
  const file = loadChanges();
  const send = args.includes("--send");
  const sources = flag("--source") ? [flag("--source")!] : Object.keys(file.sources);
  const mailer = send ? (mailerFromEnv() ?? die("No RESEND_API_KEY: nothing sent.")) : null;
  const store = needStore();
  console.log(`Change alerts from ${flag("--changes") ?? "data/changes.full.json"} (as of ${file.as_of}). ${send ? "SENDING." : "Dry run: nothing is sent."}\n`);
  for (const s of sources) {
    const r = await dispatchAlerts(file, s, { store, mailer, closed: closedTest(), site, dryRun: !send });
    console.log(describe(r) + "\n");
  }
} else if (cmd === "reset") {
  const source = positional[0] ?? die("Usage: npm run alerts -- reset <source>");
  const file = loadChanges();
  if (!file.sources[source]) die(`Unknown source ${source}. Known: ${Object.keys(file.sources).join(", ")}`);
  const n = await resetSent(file, source, needStore());
  console.log(`cleared ${n} sent: key(s) for ${source} (${sourceAddresses(file, source).length} address(es), demo inbox only)`);
} else if (cmd === "trigger") {
  const source = positional[0] ?? die("Usage: npm run alerts -- trigger <source> [--url https://yourhomerule.com]");
  const url = `${(flag("--url") ?? site).replace(/\/$/, "")}/api/alerts/dispatch`;
  const token = process.env.DEMO_TOKEN || die("No DEMO_TOKEN in env.");
  const until = Date.now() + Number(flag("--wait") ?? 600) * 1000;
  const t0 = Date.now();
  for (;;) {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ source }) }).catch(
      (e: Error) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }) as unknown as Response,
    );
    const j = (await r.json().catch(() => ({}))) as DispatchReport & { error?: string; detail?: string };
    if (r.ok) {
      console.log(`${describe(j)}\n(dispatch answered after ${Math.round((Date.now() - t0) / 1000)} s)`);
      process.exit(j.counts.failed ? 2 : 0);
    }
    if (r.status !== 404 || Date.now() > until) die(`dispatch failed: ${r.status} ${j.error ?? ""} ${j.detail ?? ""}`);
    console.log(`deploy does not have ${source} yet (${j.detail ?? "404"}); retrying in 10 s`);
    await new Promise((res) => setTimeout(res, 10_000));
  }
} else if (cmd === "run") {
  const send = args.includes("--send");
  const date = flag("--date");
  if (date !== undefined && !isIsoDate(date)) die("--date must look like YYYY-MM-DD.");
  const sim = flag("--simulate");
  if (sim && send) die("--simulate never sends.");
  const data = liveData();
  const now = new Date();
  let store;
  if (sim) {
    store = memoryStore();
    const known = readJson<Addr[]>("data/live/addresses.json");
    const ids = sim === "all" ? known.map((a) => a.address_id) : sim.split(",");
    for (const id of ids) {
      const a = known.find((x) => x.address_id === id) ?? die(`Unknown address ${id}.`);
      await store.addSubscriber({ email: `sim+${id.toLowerCase()}@example.test`, address_id: id, label: `${a.street}, ${a.postal_city}, ${a.state_code}`, confirmed_at: "2026-10-01T00:00:00Z", token: "sim", allowed: true, demo: false });
    }
    if (args.includes("--approve-all")) for (const id of data.rules.keys()) await approveRule(store, id, new Date("2026-10-01T00:00:00Z"), "simulation");
  } else store = needStore();
  const mailer = send ? (mailerFromEnv() ?? die("No RESEND_API_KEY: nothing sent.")) : null;
  const r = await runDaily(data, { store, mailer, closed: closedTest(), site, now, asOf: date, dryRun: !send });
  console.log(`${sim ? `Simulated subscribers (${sim}), memory store. ` : ""}${describeRun(r, { verbose: args.includes("--verbose") })}`);
  process.exit(r.counts.failed ? 2 : 0);
} else if (cmd === "approve" || cmd === "unapprove") {
  if (!positional.length) die(`Usage: npm run alerts -- ${cmd} <rule_id> [...]`);
  const data = liveData();
  const store = needStore();
  for (const id of positional) {
    if (cmd === "approve") {
      if (!data.rules.has(id) && !Object.values(data.changes.sources).some((s) => s.rule_ids.includes(id))) die(`Unknown rule ${id}.`);
      await approveRule(store, id, new Date());
      console.log(`approved ${id}: its lifecycle alerts may go out from the next run`);
    } else console.log(`${(await unapproveRule(store, id)) ? "unapproved" : "was not approved:"} ${id}`);
  }
} else {
  die("Usage: node scripts/alerts.ts seed|notify|reset|trigger|run|approve|unapprove … (see the header of this file)");
}
