import { changes } from "@/lib/changes/data";
import { DispatchError, dispatchAlerts } from "@/lib/alerts/dispatch";
import { depsFor } from "@/lib/alerts/server";
import { safeEqual } from "@/lib/alerts/unsub";

/*
  POST /api/alerts/dispatch  {source}   Authorization: Bearer <DEMO_TOKEN>
  The demo hook: the last step of the ingest/publish run, once the production deploy is Ready (the change data is
  imported at build time, so only a deploy that contains the source can send it). Sends the change alerts for that
  source to its confirmed subscribers (dispatch.ts). Same call for a demo-labelled rehearsal and the real one.
  404 unknown_source means this deploy does not have the source yet: the caller retries.
*/
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const want = process.env.DEMO_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !safeEqual(got, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { source?: unknown; dry_run?: unknown };
  if (typeof body.source !== "string" || !body.source) return Response.json({ error: "Send {source}." }, { status: 400 });
  const deps = depsFor(req);
  if (!deps) return Response.json({ error: "not_configured", detail: "Redis is not configured." }, { status: 503 });
  try {
    const r = await dispatchAlerts(changes, body.source, { ...deps, dryRun: body.dry_run === true });
    return Response.json(r);
  } catch (e) {
    if (e instanceof DispatchError)
      return Response.json({ error: e.code, detail: e.message, sources: Object.keys(changes.sources) }, { status: e.code === "unknown_source" ? 404 : 503 });
    console.error("dispatch failed", (e as Error).message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
