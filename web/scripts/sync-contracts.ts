// Copies the canonical contracts (and the resolved sample addresses) into web/, because Vercel only
// uploads web/. Runs before dev and build; outside the full repo (on Vercel) it keeps the committed copies.
// It also regenerates the Live data source (web/data/live/, scripts/build-live.ts) from the engine outputs.
// tests/contracts-sync.test.ts fails when a copy drifts.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_DIR, buildLive, liveInputsPresent, serialise } from "./build-live.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SYNCED = [
  { from: "contracts/jurisdictions.json", to: "web/contracts/jurisdictions.json" },
  { from: "contracts/facts.json", to: "web/contracts/facts.json" },
  { from: "contracts/contacts.json", to: "web/contracts/contacts.json" },
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
  if (liveInputsPresent(ROOT)) {
    for (const [name, value] of Object.entries(buildLive(ROOT))) {
      const rel = `${LIVE_DIR}/${name}`;
      const dst = join(ROOT, rel);
      const text = serialise(value);
      if (existsSync(dst) && readFileSync(dst, "utf8") === text) continue;
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, text);
      changed.push(rel);
    }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = sync();
  console.log(changed.length ? `sync: updated ${changed.join(", ")}` : "sync: web copies up to date");
}
