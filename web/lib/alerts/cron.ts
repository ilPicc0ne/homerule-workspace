// GET /api/alerts/cron, the daily Vercel Cron run of the lifecycle engine (daily.ts), without Next.js so the tests
// can call it. Auth: `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends when CRON_SECRET is set) or
// `Bearer <DEMO_TOKEN>` (manual runs), constant-time. DRY RUN unless ALERTS_CRON_SEND=1; a simulated date
// (?date=YYYY-MM-DD) or ?dry=1 always forces a dry run, so production never mails a simulated day.
import { describeRun, runDaily } from "./daily.ts";
import { isIsoDate, type LifeData } from "./lifecycle.ts";
import type { Mailer } from "./mail.ts";
import type { Store } from "./store.ts";
import { safeEqual } from "./unsub.ts";

/** Reads CRON_SECRET, DEMO_TOKEN, ALERTS_CRON_SEND, ALERTS_SITE_URL (process.env on Vercel). */
export type CronEnv = Record<string, string | undefined>;

export type CronDeps = { store: Store | null; mailer: Mailer | null; data: LifeData | null; closed: boolean; now: Date };

export function cronAuthorized(header: string | null, env: CronEnv): boolean {
  const got = (header ?? "").replace(/^Bearer\s+/i, "");
  if (!got) return false;
  return [env.CRON_SECRET, env.DEMO_TOKEN].some((s) => !!s && safeEqual(got, s));
}

export function cronDryRun(env: CronEnv, url: URL): boolean {
  return env.ALERTS_CRON_SEND !== "1" || url.searchParams.has("date") || url.searchParams.get("dry") === "1";
}

export async function handleCron(req: Request, env: CronEnv, deps: () => CronDeps): Promise<Response> {
  if (!cronAuthorized(req.headers.get("authorization"), env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (date !== null && !isIsoDate(date)) return Response.json({ error: "date must look like YYYY-MM-DD." }, { status: 400 });
  const dryRun = cronDryRun(env, url);
  const d = deps();
  if (!d.store) return Response.json({ error: "not_configured", detail: "Redis is not configured." }, { status: 503 });
  if (!d.data) return Response.json({ error: "not_configured", detail: "No dataset in this build." }, { status: 503 });
  if (!dryRun && !d.mailer) return Response.json({ error: "not_configured", detail: "No RESEND_API_KEY." }, { status: 503 });
  try {
    const r = await runDaily(d.data, {
      store: d.store,
      mailer: d.mailer,
      closed: d.closed,
      site: env.ALERTS_SITE_URL || url.origin,
      now: d.now,
      asOf: date ?? undefined,
      dryRun,
    });
    console.log(describeRun(r));
    const { lines, ...rest } = r;
    return Response.json({ ...rest, lines: lines.slice(0, 200), lines_total: lines.length });
  } catch (e) {
    console.error("alerts cron failed", (e as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
