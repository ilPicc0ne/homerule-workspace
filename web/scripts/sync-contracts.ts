// Copies the canonical contracts (and the resolved sample addresses) into web/, because Vercel only
// uploads web/. Runs before dev and build; outside the full repo (on Vercel) it keeps the committed copies.
// tests/contracts-sync.test.ts fails when a copy drifts.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SYNCED = [
  { from: "contracts/jurisdictions.json", to: "web/contracts/jurisdictions.json" },
  { from: "contracts/facts.json", to: "web/contracts/facts.json" },
  { from: "out/addresses.resolved.json", to: "web/data/addresses.resolved.json" },
  { from: "out/changes.full.json", to: "web/data/changes.full.json" },
];

export function sync(): string[] {
  const changed: string[] = [];
  for (const { from, to } of SYNCED) {
    const src = join(ROOT, from);
    const dst = join(ROOT, to);
    if (!existsSync(src)) continue;
    if (existsSync(dst) && readFileSync(src).equals(readFileSync(dst))) continue;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    changed.push(to);
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = sync();
  console.log(changed.length ? `sync: updated ${changed.join(", ")}` : "sync: web copies up to date");
}
