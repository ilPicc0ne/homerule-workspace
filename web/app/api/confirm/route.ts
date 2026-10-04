import { NextResponse, type NextRequest } from "next/server";
import { confirm } from "@/lib/alerts/service";
import { storeFromEnv } from "@/lib/alerts/store";

/** GET /api/confirm?token=…  Marks the subscription confirmed, then shows /alerts/confirmed. */
export async function GET(req: NextRequest) {
  const store = storeFromEnv();
  const sub = store ? await confirm(req.nextUrl.searchParams.get("token"), { store }).catch(() => null) : null;
  const to = new URL(sub ? `/alerts/confirmed?a=${encodeURIComponent(sub.address_id)}` : "/alerts/invalid", req.url);
  return NextResponse.redirect(to, 303);
}
