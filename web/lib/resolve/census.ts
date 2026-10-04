// US Census geocoder client (geographies endpoints). fetch is injected, so tests run on recorded
// responses and the batch run reads its committed cache.

export const CENSUS_BASE = "https://geocoding.geo.census.gov/geocoder/geographies";
export const BENCHMARK = "Public_AR_Current";
export const VINTAGE = "Current_Current";
/** Only the layers the jurisdiction tree needs; keeps responses (and the committed cache) small. */
export const LAYERS = "States,Counties,County Subdivisions,Consolidated Cities,Incorporated Places,Census Designated Places";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type CensusArea = {
  GEOID: string;
  NAME: string;
  BASENAME?: string;
  FUNCSTAT?: string;
  LSADC?: string;
  STUSAB?: string;
  [k: string]: unknown;
};

export type Geographies = Partial<Record<string, CensusArea[]>>;

export type CensusMatch = {
  matchedAddress: string;
  coordinates: { x: number; y: number };
  addressComponents: { city?: string; state?: string; zip?: string; [k: string]: unknown };
  geographies: Geographies;
};

export type CensusOptions = {
  fetch: FetchLike;
  /** Per attempt. */
  timeoutMs?: number;
  /** Extra attempts after a timeout, network error or 5xx. 4xx is never retried. */
  retries?: number;
  retryDelayMs?: number;
};

// No constructor parameter properties: Node's type stripping (tests, batch) doesn't support them.
export class CensusUnavailable extends Error {
  readonly kind: "timeout" | "network" | "http" | "bad_response";
  readonly status?: number;
  constructor(message: string, kind: CensusUnavailable["kind"], status?: number) {
    super(message);
    this.name = "CensusUnavailable";
    this.kind = kind;
    this.status = status;
  }
}

export type StructuredAddress = { street: string; city?: string; state?: string; zip?: string };

export function oneLineUrl(address: string): string {
  const q = new URLSearchParams({ address, benchmark: BENCHMARK, vintage: VINTAGE, layers: LAYERS, format: "json" });
  return `${CENSUS_BASE}/onelineaddress?${q}`;
}

export function structuredUrl(a: StructuredAddress): string {
  const q = new URLSearchParams({ street: a.street });
  if (a.city) q.set("city", a.city);
  if (a.state) q.set("state", a.state);
  if (a.zip) q.set("zip", a.zip);
  for (const [k, v] of Object.entries({ benchmark: BENCHMARK, vintage: VINTAGE, layers: LAYERS, format: "json" })) q.set(k, v);
  return `${CENSUS_BASE}/address?${q}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls Census and returns its address matches ([] when there is none, including Census's 400
 * "can't parse this address" answers). Throws CensusUnavailable when Census doesn't answer usefully.
 */
export async function censusMatches(url: string, opts: CensusOptions): Promise<CensusMatch[]> {
  const { fetch, timeoutMs = 8000, retries = 1, retryDelayMs = 400 } = opts;
  let last: CensusUnavailable | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs * attempt);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } catch (e) {
      const timeout = ctrl.signal.aborted;
      last = new CensusUnavailable(timeout ? `Census timed out after ${timeoutMs} ms` : `Census unreachable: ${String(e)}`, timeout ? "timeout" : "network");
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 500) {
      last = new CensusUnavailable(`Census answered ${res.status}`, "http", res.status);
      continue;
    }
    if (res.status >= 400) return [];
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      last = new CensusUnavailable("Census sent a response that isn't JSON", "bad_response", res.status);
      continue;
    }
    const matches = (body as { result?: { addressMatches?: unknown } })?.result?.addressMatches;
    if (!Array.isArray(matches)) {
      // Census reports unparsable input as {"errors": [...]} with status 200 on some paths.
      if ((body as { errors?: unknown })?.errors) return [];
      last = new CensusUnavailable("Census response has no addressMatches", "bad_response", res.status);
      continue;
    }
    return matches as CensusMatch[];
  }
  throw last ?? new CensusUnavailable("Census unavailable", "network");
}
