import type { NextRequest } from "next/server";
import { getDataset } from "@/lib/data";
import { liveAddressPayload } from "@/lib/live-address.ts";

/*
  GET /api/address/<id>?as_of=YYYY-MM-DD  (interface I5)
  Same results as the address page, with as_of, retrieval dates and not_legal_advice.
  Calculates the exact requested date with the Python engine.
  An outage uses a saved result only for the same date; otherwise returns 503.
*/

export async function GET(req: NextRequest, ctx: RouteContext<"/api/address/[id]">) {
  const { id } = await ctx.params;
  const { status, body } = await liveAddressPayload(getDataset(), id, req.nextUrl.searchParams.get("as_of"));
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
