import type { NextRequest } from "next/server";
import { getDataset } from "@/lib/data";
import { addressPayload } from "@/lib/address-payload.ts";

/*
  GET /api/address/<id>?as_of=YYYY-MM-DD  (interface I5)
  Same results as the address page, with as_of, retrieval dates and not_legal_advice.
  The date snaps to the published list (latest listed date on or before the request).
  The payload is built in lib/address-payload.ts, shared with the MCP tool get_rules.
*/

export async function GET(req: NextRequest, ctx: RouteContext<"/api/address/[id]">) {
  const { id } = await ctx.params;
  const { status, body } = addressPayload(getDataset(), id, req.nextUrl.searchParams.get("as_of"));
  return Response.json(body, { status });
}
