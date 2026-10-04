import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/alerts/service";
import { storeFromEnv } from "@/lib/alerts/store";

/*
  POST /api/unsubscribe?a=<address_id>&t=<hmac>
    - from a mail app's one-click unsubscribe (RFC 8058, List-Unsubscribe-Post): 200, no page;
    - from the button on /unsubscribe (form field from=page): then shows /alerts/unsubscribed.
  GET  goes to the /unsubscribe page; a GET never unsubscribes (link scanners).
  Same answer whether or not the token matched: unsubscribing twice is fine and reveals nothing.
*/
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const form = await req.formData().catch(() => null);
  const store = storeFromEnv();
  const secret = process.env.ALERTS_HMAC_SECRET ?? "";
  if (store) await unsubscribe(q.get("a"), q.get("t"), { store, secret }).catch(() => null);
  if (form?.get("from") === "page") return NextResponse.redirect(new URL("/alerts/unsubscribed", req.url), 303);
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL(`/unsubscribe${req.nextUrl.search}`, req.url), 303);
}
