import type { NextRequest } from "next/server";
import { changes } from "@/lib/changes/data";
import { alertPreview } from "@/lib/alerts/preview";
import { addressLabel, siteFor } from "@/lib/alerts/server";

/** GET /api/alerts/preview?address=<id>  The change-alert email for this address, simulated. Nothing is sent. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("address") ?? "";
  if (!addressLabel(id)) return Response.json({ error: "Unknown address." }, { status: 404 });
  const p = alertPreview(changes, id, siteFor(req));
  return p ? Response.json(p) : Response.json({ error: "No change data." }, { status: 404 });
}
