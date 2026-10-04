// Alert subscriptions in Upstash Redis (store `homerule-subscriptions`), over its REST API with plain fetch.
// Keys (all under "alerts:"):
//   alerts:pending:<token>                     JSON Pending, expires after 48 h (double opt-in not finished)
//   alerts:sub:<address_id>                    hash: email -> JSON Subscriber (confirmed only; carries its unsubscribe
//                                              token and the flags `allowed` / `demo` that decide who may get mail)
//   alerts:allowed                             set of emails the seed script marked allowed (gates confirmation mails
//                                              during the closed test; the per-record flag gates alerts)
//   alerts:sent:<source>:<address_id>:<hash>   "1" once Resend accepted that alert (idempotency; hash = sha256(email)[:16]), 90 days
//   alerts:rl:<ip>:<window>                    signup counter per IP, expires with its window
// Nothing else is stored. Who may receive mail is data here, set by `npm run seed-subscriber`, never an env var.

export type Pending = { email: string; address_id: string; label: string; created_at: string };
export type Subscriber = {
  email: string;
  address_id: string;
  label: string;
  confirmed_at: string;
  /** Unsubscribe token (random, per subscription; the confirm token carries over). */
  token: string;
  /** May get mail during the closed test (set by the seed script). */
  allowed: boolean;
  /** The demo inbox: the only recipients of demo-labelled (fictional) sources. */
  demo: boolean;
};

export interface Store {
  putPending(token: string, p: Pending, ttlSec: number): Promise<void>;
  /** Reads and deletes a pending request (null when unknown or expired). */
  takePending(token: string): Promise<Pending | null>;
  addSubscriber(s: Subscriber): Promise<void>;
  subscribers(addressId: string): Promise<Subscriber[]>;
  removeSubscriber(addressId: string, email: string): Promise<boolean>;
  isSent(key: string): Promise<boolean>;
  markSent(key: string): Promise<void>;
  /** Deletes the given keys; returns how many existed. */
  clear(keys: string[]): Promise<number>;
  isAllowed(email: string): Promise<boolean>;
  allow(email: string): Promise<void>;
  /** Increments a counter that expires ttlSec after its first hit; returns the new count. */
  hit(key: string, ttlSec: number): Promise<number>;
}

export const K = {
  pending: (t: string) => `alerts:pending:${t}`,
  sub: (addressId: string) => `alerts:sub:${addressId}`,
  sent: (source: string, addressId: string, hash: string) => `alerts:sent:${source}:${addressId}:${hash}`,
  rl: (ip: string, window: number) => `alerts:rl:${ip}:${window}`,
  allowed: "alerts:allowed",
};

/** How long an idempotency key lives: long enough for any rehearsal or rerun, short enough to clean itself up. */
export const SENT_TTL = 60 * 60 * 24 * 90;

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

  return {
    putPending: async (t, p, ttl) => void (await one(["SET", K.pending(t), JSON.stringify(p), "EX", ttl])),
    async takePending(t) {
      const [v] = await pipe([["GET", K.pending(t)], ["DEL", K.pending(t)]]);
      return typeof v === "string" ? (JSON.parse(v) as Pending) : null;
    },
    addSubscriber: async (s) => void (await one(["HSET", K.sub(s.address_id), s.email, JSON.stringify(s)])),
    async subscribers(a) {
      const flat = (await one<string[] | null>(["HGETALL", K.sub(a)])) ?? [];
      const out: Subscriber[] = [];
      for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]) as Subscriber);
      return out;
    },
    removeSubscriber: async (a, email) => ((await one<number>(["HDEL", K.sub(a), email])) ?? 0) > 0,
    isSent: async (k) => ((await one<number>(["EXISTS", k])) ?? 0) > 0,
    markSent: async (k) => void (await one(["SET", k, "1", "EX", SENT_TTL])),
    clear: async (keys) => (keys.length ? ((await one<number>(["DEL", ...keys])) ?? 0) : 0),
    isAllowed: async (e) => ((await one<number>(["SISMEMBER", K.allowed, e])) ?? 0) > 0,
    allow: async (e) => void (await one(["SADD", K.allowed, e])),
    async hit(k, ttl) {
      // SET NX starts the window with its expiry; INCR keeps that expiry.
      const [, n] = await pipe([["SET", k, "0", "EX", ttl, "NX"], ["INCR", k]]);
      return Number(n);
    },
  };
}

/** In-memory store for tests and local runs without Redis. `now` (ms) drives expiry. */
export function memoryStore(now: () => number = Date.now) {
  const kv = new Map<string, { v: string; exp: number }>();
  const subs = new Map<string, Map<string, Subscriber>>();
  const allowed = new Set<string>();
  const get = (k: string) => {
    const e = kv.get(k);
    if (!e) return null;
    if (e.exp <= now()) {
      kv.delete(k);
      return null;
    }
    return e.v;
  };
  const store: Store & { keys(): string[]; all(): Subscriber[] } = {
    putPending: async (t, p, ttl) => void kv.set(K.pending(t), { v: JSON.stringify(p), exp: now() + ttl * 1000 }),
    async takePending(t) {
      const v = get(K.pending(t));
      kv.delete(K.pending(t));
      return v ? (JSON.parse(v) as Pending) : null;
    },
    async addSubscriber(s) {
      if (!subs.has(s.address_id)) subs.set(s.address_id, new Map());
      subs.get(s.address_id)!.set(s.email, { ...s });
    },
    subscribers: async (a) => [...(subs.get(a)?.values() ?? [])],
    removeSubscriber: async (a, e) => subs.get(a)?.delete(e) ?? false,
    isSent: async (k) => get(k) !== null,
    markSent: async (k) => void kv.set(k, { v: "1", exp: now() + SENT_TTL * 1000 }),
    clear: async (keys) => keys.filter((k) => get(k) !== null && kv.delete(k)).length,
    isAllowed: async (e) => allowed.has(e),
    allow: async (e) => void allowed.add(e),
    async hit(k, ttl) {
      const cur = get(k);
      const n = Number(cur ?? 0) + 1;
      kv.set(k, { v: String(n), exp: cur === null ? now() + ttl * 1000 : kv.get(k)!.exp });
      return n;
    },
    keys: () => [...kv.keys()].filter((k) => get(k) !== null),
    all: () => [...subs.values()].flatMap((m) => [...m.values()]),
  };
  return store;
}

/** The store from env, or null when Redis is not configured. */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store | null {
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  return url && token ? redisStore(url, token) : null;
}
