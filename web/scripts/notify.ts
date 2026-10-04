// make notify [SEND=1] [SOURCE=<change source id>] [CHANGES=<path>]
// Dry run by default: lists confirmed subscribers whose address is in the diff, with the email each would get.
// --send actually sends (allowlisted recipients only). Reads KV_* / RESEND_API_KEY / ALERTS_ALLOWLIST from env (.env.local).
import { readFileSync } from "node:fs";
import { SITE } from "../lib/changes/email.ts";
import type { ChangesFile } from "../lib/changes/types.ts";
import { allowlist, mailerFromEnv } from "../lib/alerts/mail.ts";
import { describe, plan, send } from "../lib/alerts/notify.ts";
import { storeFromEnv } from "../lib/alerts/store.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const doSend = args.includes("--send");
const changesPath = flag("--changes") ?? "../out/changes.full.json";
const source = flag("--source") || undefined;

const store = storeFromEnv();
if (!store) {
  console.error("No KV_REST_API_URL / KV_REST_API_TOKEN. Run `npx vercel env pull web/.env.local` from the repo root.");
  process.exit(1);
}
const file = JSON.parse(readFileSync(changesPath, "utf8")) as ChangesFile;
const site = process.env.ALERTS_SITE_URL || SITE;
const p = plan(await store.confirmed(), file, { site, allow: allowlist(), source });

console.log(`Change alerts from ${changesPath} (as of ${file.as_of})${source ? `, source ${source}` : ""}. ${doSend ? "SENDING." : "Dry run: nothing is sent."}\n`);
console.log(describe(p));
if (doSend && p.length) {
  const mailer = mailerFromEnv();
  if (!mailer) {
    console.error("No RESEND_API_KEY: nothing sent.");
    process.exit(1);
  }
  for (const line of await send(p, mailer)) console.log(line);
} else if (p.length) {
  console.log(`${p.length} email(s) would be sent (${p.filter((x) => x.allowed).length} allowlisted). Send with: make notify SEND=1`);
}
