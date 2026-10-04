// Offline Census fixtures: raw responses recorded live on 04.10.2026 (tests/fixtures/census).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FetchLike } from "../lib/resolve/census.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const fixtureDir = join(here, "fixtures", "census");
export const repoRoot = join(here, "..", "..");

export function slug(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A fetch that answers one-line Census calls from the recorded fixtures and records every URL. */
export function fixtureFetch(): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const q = new URL(url).searchParams.get("address") ?? "";
    const file = join(fixtureDir, `${slug(q)}.json`);
    if (!existsSync(file)) throw new Error(`no fixture for "${q}" (${file})`);
    const rec = JSON.parse(readFileSync(file, "utf8"));
    return new Response(JSON.stringify(rec.body), { status: rec.status });
  }) as FetchLike & { calls: string[] };
  f.calls = calls;
  return f;
}

/** A fetch that never answers until aborted, like a hung Census server. */
export const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

export function statusFetch(status: number, body = "Service Unavailable"): FetchLike & { calls: number } {
  const f = (async () => {
    f.calls++;
    return new Response(body, { status });
  }) as unknown as FetchLike & { calls: number };
  f.calls = 0;
  return f;
}
