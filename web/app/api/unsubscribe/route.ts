import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/alerts/service";
import { storeFromEnv } from "@/lib/alerts/store";

/*
  GET  /api/unsubscribe?token=…  deletes the subscription, then shows /alerts/unsubscribed.
  POST /api/unsubscribe?token=…  the one-click unsubscribe mail apps send (List-Unsubscribe-Post): 200, no page.
*/
async function drop(req: NextRequest) {
  const store = storeFromEnv();
  return store ? await unsubscribe(req.nextUrl.searchParams.get("token"), { store }).catch(() => null) : null;
}

export async function GET(req: NextRequest) {
  await drop(req);
  // Same page whether or not the token existed: unsubscribing twice is fine and reveals nothing.
  return NextResponse.redirect(new URL("/alerts/unsubscribed", req.url), 303);
}

export async function POST(req: NextRequest) {
  await drop(req);
  return new Response(null, { status: 200 });
}
