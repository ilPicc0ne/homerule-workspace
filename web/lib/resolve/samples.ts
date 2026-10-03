// The 500 sample addresses as resolved by the batch run (web/data is a synced copy of
// out/addresses.resolved.json). A typed sample address answers from here, with its building facts.
import data from "../../data/addresses.resolved.json" with { type: "json" };
import type { ParsedInput } from "./input.ts";
import { searchPlace } from "./jurisdictions.ts";
import { plain, streetKey } from "./normalise.ts";
import type { ResolvedAddress, ResolvedFile } from "./types.ts";

export type SampleIndex = {
  lookup(p: ParsedInput): ResolvedAddress | null;
  /** A Census match as a sample: its street line ("10635 SHERMAN GROVE AVE") in our municipality cityId. */
  atMatch(street: string, cityId: string): ResolvedAddress | null;
  size: number;
};

let cached: SampleIndex | null = null;

export function sampleIndex(file: ResolvedFile = data as unknown as ResolvedFile): SampleIndex {
  if (cached && file === (data as unknown)) return cached;
  const byKey = new Map<string, ResolvedAddress[]>();
  for (const a of file.addresses) {
    if (!a.normalised_street) continue;
    const k = streetKey(a.normalised_street);
    byKey.set(k, [...(byKey.get(k) ?? []), a]);
  }
  const keys = [...byKey.keys()];

  const cityFits = (a: ResolvedAddress, typed: string) => {
    const t = plain(typed);
    if (t === plain(a.postal_city) || (a.legal_city && t === plain(a.legal_city))) return true;
    const m = searchPlace(typed);
    return !!m && m.jurisdiction.id === a.jurisdictions.city;
  };

  const index: SampleIndex = {
    size: file.addresses.length,
    atMatch(street, cityId) {
      const hits = (byKey.get(streetKey(street)) ?? []).filter((a) => a.jurisdictions.city === cityId);
      return hits.length === 1 ? hits[0] : null;
    },
    lookup(p) {
      if (p.kind !== "address" || !p.street) return null;
      const inState = (a: ResolvedAddress) => !p.state || a.input.state === p.state.abbr;

      if (p.city) {
        const hits = (byKey.get(streetKey(p.street)) ?? []).filter((a) => inState(a) && cityFits(a, p.city!));
        return hits.length === 1 ? hits[0] : null;
      }
      // No commas: "3515 fillmore street apt 4b san francisco ca 94123". The sample street must be a
      // prefix, and when several fit, the rest must name the city.
      const typed = streetKey(p.street);
      const hits: { a: ResolvedAddress; rest: string }[] = [];
      for (const k of keys) {
        if (typed === k || typed.startsWith(`${k} `)) {
          for (const a of byKey.get(k)!) if (inState(a)) hits.push({ a, rest: plain(typed.slice(k.length)) });
        }
      }
      if (hits.length === 1) return hits[0].a;
      const named = hits.filter(({ a, rest }) => rest.includes(plain(a.postal_city)) || (a.legal_city && rest.includes(plain(a.legal_city))));
      return named.length === 1 ? named[0].a : null;
    },
  };
  if (file === (data as unknown)) cached = index;
  return index;
}
