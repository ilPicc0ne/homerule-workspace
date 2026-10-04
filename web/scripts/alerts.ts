// Change alerts from the command line. Reads KV_* / RESEND_API_KEY / DEMO_RECIPIENTS / ALERTS_HMAC_SECRET / DEMO_TOKEN
// from env (.env.local via `npx vercel env pull web/.env.local`). Emails are masked in all output.
//
//   seed <address_id...>                       confirmed subscriber for every DEMO_RECIPIENTS address at these IDs (demo inbox only)
//   notify [--source S] [--send] [--changes P]  local run of dispatchAlerts on a changes file; dry run unless --send
//   reset <source> [--changes P]                clear the source's sent: keys for DEMO_RECIPIENTS (between rehearsals)
//   trigger <source> [--url U] [--wait S]      POST /api/alerts/dispatch on the deployed site (default ALERTS_SITE_URL or
//                                              https://yourhomerule.com), retrying until that deploy has the source
import { readFileSync } from "node:fs";
import { SITE } from "../lib/changes/email.ts";
import type { ChangesFile } from "../lib/changes/types.ts";
import { closedTest, demoRecipients, mailerFromEnv } from "../lib/alerts/mail.ts";
import { describe, dispatchAlerts, resetSent, sourceAddresses, type DispatchReport } from "../lib/alerts/dispatch.ts";
import { storeFromEnv } from "../lib/alerts/store.ts";
import { maskEmail } from "../lib/alerts/unsub.ts";

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = ["--source", "--changes", "--url", "--wait"];
const positional = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};
const site = process.env.ALERTS_SITE_URL || SITE;
const loadChanges = () => JSON.parse(readFileSync(flag("--changes") ?? "data/changes.full.json", "utf8")) as ChangesFile;
const needStore = () => storeFromEnv() ?? die("No KV_REST_API_URL / KV_REST_API_TOKEN. Run `npx vercel env pull web/.env.local` from the repo root.");
const recipients = () => {
  const r = demoRecipients();
  return r.size ? r : die("DEMO_RECIPIENTS is empty: set it in web/.env.local (never in the repo).");
};

if (cmd === "seed") {
  const ids = positional;
  if (!ids.length) die("Usage: npm run seed-subscriber -- <address_id> [...]");
  const store = needStore();
  const known = (JSON.parse(readFileSync("data/live/addresses.json", "utf8")) as { address_id: string; street: string; postal_city: string; state_code: string }[]);
  for (const id of ids) {
    const a = known.find((x) => x.address_id === id) ?? die(`Unknown address ${id}.`);
    const label = `${a.street}, ${a.postal_city}, ${a.state_code}`;
    for (const email of recipients()) {
      await store.addSubscriber({ email, address_id: id, label, confirmed_at: new Date().toISOString() });
      console.log(`subscribed ${maskEmail(email)} to ${id} (${label})`);
    }
  }
} else if (cmd === "notify") {
  const file = loadChanges();
  const send = args.includes("--send");
  const sources = flag("--source") ? [flag("--source")!] : Object.keys(file.sources);
  const secret = process.env.ALERTS_HMAC_SECRET || (send ? die("No ALERTS_HMAC_SECRET.") : "dry-run-secret");
  const mailer = send ? (mailerFromEnv() ?? die("No RESEND_API_KEY: nothing sent.")) : null;
  const store = needStore();
  console.log(`Change alerts from ${flag("--changes") ?? "data/changes.full.json"} (as of ${file.as_of}). ${send ? "SENDING." : "Dry run: nothing is sent."}\n`);
  for (const s of sources) {
    const r = await dispatchAlerts(file, s, { store, mailer, allow: demoRecipients(), closed: closedTest(), secret, site, dryRun: !send });
    console.log(describe(r) + "\n");
  }
} else if (cmd === "reset") {
  const source = positional[0] ?? die("Usage: npm run alerts -- reset <source>");
  const file = loadChanges();
  if (!file.sources[source]) die(`Unknown source ${source}. Known: ${Object.keys(file.sources).join(", ")}`);
  const n = await resetSent(file, source, needStore(), recipients());
  console.log(`cleared ${n} sent: key(s) for ${source} (${sourceAddresses(file, source).length} address(es), DEMO_RECIPIENTS only)`);
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
} else {
  die("Usage: node scripts/alerts.ts seed|notify|reset|trigger … (see the header of this file)");
}
