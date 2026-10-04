// Alert subscriptions in Upstash Redis (store `homerule-subscriptions`), over its REST API with plain fetch.
// Keys (all under "alerts:"):
//   alerts:pending:<token>                     JSON Pending, expires after 48 h (double opt-in not finished)
//   alerts:sub:<address_id>                    hash: email -> JSON Subscriber (confirmed only; carries its unsubscribe
//                                              token and the flags `allowed` / `demo` that decide who may get mail)
//   alerts:allowed                             set of emails the seed script marked allowed (gates confirmation mails
//                                              during the closed test; the per-record flag gates alerts)
//   alerts:sent:<source>:<address_id>:<hash>   "1" once Resend accepted that alert (idempotency; hash = sha256(email)[:16]), 90 days
//   alerts:rl:<ip>:<window>                    signup counter per IP, expires with its window
// Lifecycle engine (daily digest, lib/alerts/daily.ts):
//   alerts:sent:<event_id>:<hash>              "1" once Resend accepted the digest holding that event, 2 years
//                                              (event_id = <rule_id>|<address_id>|<trigger>|<date>)
//   alerts:approved:<rule_id>                  JSON {at, by}: the rule's lifecycle alerts may go out (set once, by CLI)
//   alerts:told:<hash>                         hash "<address_id>|<rule_id>|start|end" -> JSON of what we told this
//                                              email (date, status, event), the memory corrections compare against
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
  /** Writes the idempotency key; ttlSec defaults to SENT_TTL (90 days). */
  markSent(key: string, ttlSec?: number): Promise<void>;
  /** Deletes the given keys; returns how many existed. */
  clear(keys: string[]): Promise<number>;
  isAllowed(email: string): Promise<boolean>;
  allow(email: string): Promise<void>;
  /** Increments a counter that expires ttlSec after its first hit; returns the new count. */
  hit(key: string, ttlSec: number): Promise<number>;
  /** Address IDs with at least one confirmed subscriber (SCAN over sub:*). */
  subscribedAddresses(): Promise<string[]>;
  get(key: string): Promise<string | null>;
  /** SET, with an expiry when ttlSec is given. */
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
}

export const K = {
  pending: (t: string) => `alerts:pending:${t}`,
  sub: (addressId: string) => `alerts:sub:${addressId}`,
  sent: (source: string, addressId: string, hash: string) => `alerts:sent:${source}:${addressId}:${hash}`,
  rl: (ip: string, window: number) => `alerts:rl:${ip}:${window}`,
  allowed: "alerts:allowed",
  /** Lifecycle event sent to this email (idempotency of the daily digest). */
  sentEvent: (eventId: string, hash: string) => `alerts:sent:${eventId}:${hash}`,
  approved: (ruleId: string) => `alerts:approved:${ruleId}`,
  told: (hash: string) => `alerts:told:${hash}`,
};

/** Lifecycle events can be a month apart (30 days before, on the day) and years after the first one: keep 2 years. */
export const EVENT_SENT_TTL = 60 * 60 * 24 * 730;

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
    markSent: async (k, ttl) => void (await one(["SET", k, "1", "EX", ttl ?? SENT_TTL])),
    clear: async (keys) => (keys.length ? ((await one<number>(["DEL", ...keys])) ?? 0) : 0),
    isAllowed: async (e) => ((await one<number>(["SISMEMBER", K.allowed, e])) ?? 0) > 0,
    allow: async (e) => void (await one(["SADD", K.allowed, e])),
    async hit(k, ttl) {
      // SET NX starts the window with its expiry; INCR keeps that expiry.
      const [, n] = await pipe([["SET", k, "0", "EX", ttl, "NX"], ["INCR", k]]);
      return Number(n);
    },
    async subscribedAddresses() {
      const ids = new Set<string>();
      let cursor = "0";
      do {
        const [next, keys] = (await one<[string, string[]]>(["SCAN", cursor, "MATCH", "alerts:sub:*", "COUNT", 500])) ?? ["0", []];
        for (const k of keys) ids.add(k.slice("alerts:sub:".length));
        cursor = String(next);
      } while (cursor !== "0");
      return [...ids].sort();
    },
    get: async (k) => (await one<string | null>(["GET", k])) ?? null,
    set: async (k, v, ttl) => void (await one(ttl ? ["SET", k, v, "EX", ttl] : ["SET", k, v])),
    async hgetall(k) {
      const flat = (await one<string[] | null>(["HGETALL", k])) ?? [];
      const out: Record<string, string> = {};
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
      return out;
    },
    hset: async (k, f, v) => void (await one(["HSET", k, f, v])),
    hdel: async (k, f) => void (await one(["HDEL", k, f])),
  };
}

/** In-memory store for tests and local runs without Redis. `now` (ms) drives expiry. */
export function memoryStore(now: () => number = Date.now) {
  const kv = new Map<string, { v: string; exp: number }>();
  const subs = new Map<string, Map<string, Subscriber>>();
  const hashes = new Map<string, Map<string, string>>();
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
    markSent: async (k, ttl) => void kv.set(k, { v: "1", exp: now() + (ttl ?? SENT_TTL) * 1000 }),
    clear: async (keys) => keys.filter((k) => get(k) !== null && kv.delete(k)).length,
    isAllowed: async (e) => allowed.has(e),
    allow: async (e) => void allowed.add(e),
    async hit(k, ttl) {
      const cur = get(k);
      const n = Number(cur ?? 0) + 1;
      kv.set(k, { v: String(n), exp: cur === null ? now() + ttl * 1000 : kv.get(k)!.exp });
      return n;
    },
    subscribedAddresses: async () => [...subs.keys()].filter((a) => (subs.get(a)?.size ?? 0) > 0).sort(),
    get: async (k) => get(k),
    set: async (k, v, ttl) => void kv.set(k, { v, exp: ttl ? now() + ttl * 1000 : Infinity }),
    hgetall: async (k) => Object.fromEntries(hashes.get(k) ?? []),
    async hset(k, f, v) {
      if (!hashes.has(k)) hashes.set(k, new Map());
      hashes.get(k)!.set(f, v);
    },
    hdel: async (k, f) => void hashes.get(k)?.delete(f),
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
