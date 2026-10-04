import { NextResponse, type NextRequest } from "next/server";
import { confirm } from "@/lib/alerts/service";
import { storeFromEnv } from "@/lib/alerts/store";

/*
  POST /api/confirm  (form field t, from the button on /confirm)  moves the pending request to sub:<address_id>,
  then shows /alerts/confirmed. Only POST confirms: mail scanners prefetch GET links.
  GET  /api/confirm?token=…  (links from before this change) goes to the confirm page, which asks for the tap.
*/
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const t = (form?.get("t") as string | null) ?? req.nextUrl.searchParams.get("t");
  const store = storeFromEnv();
  const sub = store ? await confirm(t, { store }).catch(() => null) : null;
  const to = new URL(sub ? `/alerts/confirmed?a=${encodeURIComponent(sub.address_id)}` : "/alerts/invalid", req.url);
  return NextResponse.redirect(to, 303);
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("token") ?? req.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/confirm?t=${encodeURIComponent(t)}`, req.url), 303);
}
