// Alert subscriptions in Upstash Redis (store `homerule-subscriptions`), over its REST API with plain fetch.
// Keys (all under "alerts:"):
//   alerts:sub:<token>            JSON Subscription (pending or confirmed; the token is also the unsubscribe key)
//   alerts:key:<email>|<address>  token, so a second signup for the same pair reuses the first
//   alerts:pending / alerts:confirmed  sets of tokens
// Nothing else is stored. No expiry: pending requests from the closed test are kept for the owner.

export type Status = "pending" | "confirmed";

export type Subscription = {
  token: string;
  email: string;
  address_id: string;
  label: string;
  status: Status;
  created_at: string;
  confirmed_at: string | null;
  /** Whether the email was on ALERTS_ALLOWLIST when the request came in (a confirmation mail was attempted). */
  allowlisted: boolean;
};

export interface Store {
  get(token: string): Promise<Subscription | null>;
  tokenFor(email: string, addressId: string): Promise<string | null>;
  save(sub: Subscription): Promise<void>;
  remove(token: string): Promise<Subscription | null>;
  confirmed(): Promise<Subscription[]>;
}

const pairKey = (email: string, addressId: string) => `alerts:key:${email.toLowerCase()}|${addressId}`;
const subKey = (token: string) => `alerts:sub:${token}`;

type Fetch = typeof fetch;
type Cmd = (string | number)[];

/** The Upstash REST store. url/token come from KV_REST_API_URL / KV_REST_API_TOKEN. */
export function redisStore(url: string, token: string, f: Fetch = fetch): Store {
  const base = url.replace(/\/$/, "");
  async function call<T>(path: string, body: unknown): Promise<T> {
    const r = await f(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await r.json()) as unknown;
    if (!r.ok) throw new Error(`Redis error ${r.status}`);
    return j as T;
  }
  const one = async <T>(cmd: Cmd) => {
    const j = await call<{ result?: T; error?: string }>("", cmd);
    if (j.error) throw new Error(`Redis: ${j.error}`);
    return j.result as T;
  };
  const pipe = async (cmds: Cmd[]) => {
    const j = await call<{ result?: unknown; error?: string }[]>("/pipeline", cmds);
    const bad = j.find((x) => x.error);
    if (bad) throw new Error(`Redis: ${bad.error}`);
    return j.map((x) => x.result);
  };
  const parse = (s: unknown) => (typeof s === "string" ? (JSON.parse(s) as Subscription) : null);

  return {
    get: async (t) => parse(await one<string | null>(["GET", subKey(t)])),
    tokenFor: async (email, addressId) => (await one<string | null>(["GET", pairKey(email, addressId)])) ?? null,
    async save(sub) {
      const [from, to] = sub.status === "confirmed" ? ["alerts:pending", "alerts:confirmed"] : ["alerts:confirmed", "alerts:pending"];
      await pipe([
        ["SET", subKey(sub.token), JSON.stringify(sub)],
        ["SET", pairKey(sub.email, sub.address_id), sub.token],
        ["SREM", from, sub.token],
        ["SADD", to, sub.token],
      ]);
    },
    async remove(t) {
      const sub = parse(await one<string | null>(["GET", subKey(t)]));
      if (!sub) return null;
      await pipe([
        ["DEL", subKey(t)],
        ["DEL", pairKey(sub.email, sub.address_id)],
        ["SREM", "alerts:pending", t],
        ["SREM", "alerts:confirmed", t],
      ]);
      return sub;
    },
    async confirmed() {
      const tokens = (await one<string[]>(["SMEMBERS", "alerts:confirmed"])) ?? [];
      if (!tokens.length) return [];
      const vals = (await one<(string | null)[]>(["MGET", ...tokens.map(subKey)])) ?? [];
      return vals.map(parse).filter((s): s is Subscription => !!s && s.status === "confirmed");
    },
  };
}

/** In-memory store for tests and local runs without Redis. */
export function memoryStore(): Store & { all(): Subscription[] } {
  const subs = new Map<string, Subscription>();
  const keys = new Map<string, string>();
  return {
    get: async (t) => subs.get(t) ?? null,
    tokenFor: async (e, a) => keys.get(pairKey(e, a)) ?? null,
    async save(s) {
      subs.set(s.token, { ...s });
      keys.set(pairKey(s.email, s.address_id), s.token);
    },
    async remove(t) {
      const s = subs.get(t);
      if (!s) return null;
      subs.delete(t);
      keys.delete(pairKey(s.email, s.address_id));
      return s;
    },
    confirmed: async () => [...subs.values()].filter((s) => s.status === "confirmed"),
    all: () => [...subs.values()],
  };
}

/** The store from env, or null when Redis is not configured. */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store | null {
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  return url && token ? redisStore(url, token) : null;
}
