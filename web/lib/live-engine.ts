import { z } from "zod";
import { engineRows } from "./engine-rows.ts";
import type { AddressResult } from "./resolve/types.ts";
import type { Result, Rule } from "./types.ts";

const responseSchema = z.object({
  as_of: z.string(),
  not_legal_advice: z.literal(true),
  engine: z.string().regex(/^[a-f0-9]{64}$/),
  results: z.array(z.object({
    team_rule_id: z.string(),
    category: z.enum(["rent_increase_limits", "just_cause_eviction", "security_deposits", "application_screening_fees", "screening_restrictions", "algorithmic_rent_setting"]),
    result: z.enum(["applies", "unknown", "superseded", "not_yet_effective", "pending"]),
    confidence: z.number().min(0).max(1),
    explanation: z.string(),
    value: z.union([z.string(), z.object({
      conditional: z.array(z.string().nullable()).min(1),
      depends_on: z.array(z.string()),
      qualifications: z.array(z.string()).optional(),
    })]).nullable().optional(),
    missing: z.array(z.string()),
    missing_deciding: z.array(z.string()).optional(),
    governed_by: z.string().nullable().optional(),
    conflict_with: z.array(z.string()),
    conflict_flag: z.boolean(),
  })).max(256),
});

/** Typed addresses have Census jurisdictions only, never facts borrowed from a sample. */
export function typedEngineRecord(r: AddressResult) {
  const level = (kind: string) => r.tree.find(l => l.level === kind);
  const city = level("municipality");
  const jurisdictions = { state: level("state")?.id ?? null, county: level("county")?.id ?? null,
    city: city?.status === "covered" ? city.id : null };
  return {
    jurisdictions,
    stack: [jurisdictions.state, jurisdictions.city].filter(Boolean),
    legal_city: city?.name ?? null,
    coords: r.coords,
    facts: { built: null, units: null, use_class: null, subsidised: null, owner_type: null, owner_occupied: null },
    source: { jurisdiction: "census" },
    source_detail: {},
    // The online resolver has no numeric confidence field. Match batch.ts's
    // accepted Census result (0.99), not its postal/neighbourhood fallbacks.
    confidence: { jurisdiction: 0.99, built: 0, units: 0 },
    assumptions: [],
  };
}

export type EngineEnvironment = Record<string, string | undefined>;

/** Deployment URL comes from trusted server configuration, never request Host headers. */
export function engineEndpoint(env: EngineEnvironment): string | null {
  if (env.LIVE_ENGINE_DISABLED === "1") return null;
  const origin = env.LIVE_ENGINE_ORIGIN ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null);
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return new URL("/api/engine", url).href;
  } catch { return null; }
}

/** null signals transport, validation or engine failure; callers choose an explicitly dated fallback. */
export async function evaluateRecord(record: unknown, rules: Rule[], asOf: string, options: {
  fetch?: typeof fetch; env?: EngineEnvironment; timeoutMs?: number;
} = {}): Promise<{ results: Result[]; engine: string } | null> {
  const env = options.env ?? process.env;
  const endpoint = engineEndpoint(env);
  if (!endpoint) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("engine timeout")); }, options.timeoutMs ?? 3000);
    });
    const request = async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Vercel preview protection is separate from this public, read-only endpoint.
      if (env.VERCEL_URL && endpoint === `https://${env.VERCEL_URL}/api/engine` && env.VERCEL_AUTOMATION_BYPASS_SECRET)
        headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const response = await (options.fetch ?? fetch)(endpoint, {
        method: "POST", headers, body: JSON.stringify({ as_of: asOf, record }),
        signal: controller.signal, cache: "no-store", redirect: "error",
      });
      if (!response.ok) return null;
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.as_of !== asOf) return null;
      const byId = new Map(rules.map(rule => [rule.rule_id, rule]));
      if (parsed.data.results.some(row => byId.get(row.team_rule_id)?.category !== row.category) ||
          new Set(parsed.data.results.map(row => row.team_rule_id)).size !== parsed.data.results.length) return null;
      return { results: engineRows(parsed.data.results, rules), engine: parsed.data.engine };
    };
    return await Promise.race([request(), deadline]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** Typed pages never borrow sample facts. */
export async function liveEngine(r: AddressResult, rules: Rule[], asOf: string,
  options: Parameters<typeof evaluateRecord>[3] = {}) {
  if (r.source !== "census" || r.sample || r.coverage === "not_covered") return null;
  return evaluateRecord(typedEngineRecord(r), rules, asOf, options);
}
