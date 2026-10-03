import type { Address, Jurisdiction } from "./types";

/*
  Client-side search over the sample addresses and the jurisdiction list
  (contracts/jurisdictions.json, with aliases such as "Dorchester" → Boston).
  Pure functions: the index is built on the server and passed to the search box.
*/

export type AddressEntry = {
  kind: "address";
  id: string;
  label: string;
  sub: string;
  key: string;
  demo: boolean;
  cityId: string;
};

export type PlaceEntry = {
  kind: "place";
  id: string;
  label: string;
  sub: string;
  keys: string[];
  aliases: string[];
};

export type SearchIndex = { addresses: AddressEntry[]; places: PlaceEntry[] };

export type Resolution =
  | { kind: "empty" }
  | { kind: "address"; entry: AddressEntry }
  | { kind: "place"; entry: PlaceEntry; via?: string }
  /** Looks like a street address, but not one of the sample addresses. */
  | { kind: "unmatched_address"; query: string; place?: PlaceEntry }
  | { kind: "not_covered"; query: string };

export type Suggestion = (AddressEntry | PlaceEntry) & { via?: string };

const SUFFIX: Record<string, string> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  drive: "dr",
  road: "rd",
  boulevard: "blvd",
  place: "pl",
  court: "ct",
  lane: "ln",
  terrace: "ter",
};

const STATE_TAIL = new Set(["ca", "nj", "ma", "california", "new jersey", "massachusetts", "usa", "us"]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => SUFFIX[w] ?? w)
    .join(" ");
}

/** Drop a trailing state name or code and ZIP: "Berkeley, CA 94703" → "berkeley". */
function stripTail(q: string): string {
  let out = q.replace(/\s\d{5}$/, "");
  for (const tail of STATE_TAIL) {
    if (out.endsWith(` ${tail}`) && out !== tail) out = out.slice(0, -tail.length - 1);
  }
  return out.replace(/^city of /, "");
}

export function buildIndex(addresses: Address[], jurisdictions: Jurisdiction[]): SearchIndex {
  const byId = new Map(jurisdictions.map((j) => [j.id, j]));
  const name = (j: Jurisdiction) => j.legal_name.replace(/ city$/, "");
  return {
    addresses: addresses.map((a) => {
      const city = byId.get(a.jurisdictions.city);
      return {
        kind: "address" as const,
        id: a.address_id,
        label: a.street,
        sub: `${a.postal_city}, ${a.state_code}`,
        key: normalize(a.street),
        demo: !!a.demo,
        cityId: city?.id ?? a.jurisdictions.city,
      };
    }),
    places: jurisdictions.map((j) => {
      const parent = j.parent ? byId.get(j.parent) : undefined;
      const state = j.level === "state" ? undefined : j.level === "county" ? parent : parent?.parent ? byId.get(parent.parent) : undefined;
      const sub =
        j.level === "state" ? "State" : j.level === "county" ? `County, ${state?.legal_name ?? ""}` : `City, ${state?.legal_name ?? ""}`;
      const keys = [name(j), j.legal_name, j.id.replace(/-/g, " "), ...(j.schema_name ? [j.schema_name] : [])];
      return {
        kind: "place" as const,
        id: j.id,
        label: name(j),
        sub,
        keys: [...new Set(keys.map(normalize))],
        aliases: j.aliases,
      };
    }),
  };
}

function aliasHit(p: PlaceEntry, q: string, prefix: boolean): string | undefined {
  return p.aliases.find((a) => {
    const k = normalize(a);
    return prefix ? k.startsWith(q) : k === q;
  });
}

export function resolve(query: string, index: SearchIndex): Resolution {
  const raw = normalize(query);
  if (!raw) return { kind: "empty" };

  // An address needs a house number: the typed text contains a street, or starts one ("3515 fill").
  const startsWithNumber = /^\d/.test(raw);
  if (startsWithNumber) {
    const addr =
      index.addresses.find((a) => a.demo && (raw.startsWith(a.key) || a.key.startsWith(raw))) ??
      index.addresses.find((a) => raw.startsWith(a.key) || (raw.length >= 4 && a.key.startsWith(raw)));
    if (addr) return { kind: "address", entry: addr };
    const q = stripTail(raw);
    const place = index.places.find((p) => p.keys.some((k) => k.length >= 4 && q.endsWith(` ${k}`)));
    return { kind: "unmatched_address", query: query.trim(), place };
  }

  const q = stripTail(raw);
  for (const p of index.places) {
    if (p.keys.includes(q)) return { kind: "place", entry: p };
  }
  for (const p of index.places) {
    const via = aliasHit(p, q, false);
    if (via) return { kind: "place", entry: p, via };
  }
  return { kind: "not_covered", query: query.trim() };
}

export function suggest(query: string, index: SearchIndex, limit = 6): Suggestion[] {
  const raw = normalize(query);
  if (raw.length < 2) return [];
  const q = stripTail(raw);
  const out: Suggestion[] = [];

  for (const p of index.places) {
    if (p.keys.some((k) => k.startsWith(q))) out.push(p);
    else {
      const via = aliasHit(p, q, true);
      if (via) out.push({ ...p, via });
    }
  }
  // Addresses only once a house number is typed, so "New York" never matches "140 New York Ave".
  if (/^\d/.test(raw)) {
    const addrScore = (a: AddressEntry) => (a.key.startsWith(raw) ? 0 : 1) + (a.demo ? 0 : 2);
    const addrs = index.addresses
      .filter((a) => a.key.startsWith(raw) || raw.startsWith(a.key))
      .sort((a, b) => addrScore(a) - addrScore(b));
    return [...addrs, ...out].slice(0, limit);
  }
  return out.slice(0, limit);
}
