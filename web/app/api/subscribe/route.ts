import { addressLabel, depsFor } from "@/lib/alerts/server";
import { subscribe } from "@/lib/alerts/service";

/*
  POST /api/subscribe  {email, address_id}
  Saves a pending subscription (Upstash Redis) and sends the double opt-in email, but only to addresses on
  ALERTS_ALLOWLIST (closed test). Returns {status, preview}: the preview is the confirmation email with a
  non-working link, for the simulated view on the page.
*/
export async function POST(req: Request) {
  let body: { email?: unknown; address_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "invalid", error: "Send JSON." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const addressId = typeof body.address_id === "string" ? body.address_id : "";
  const label = addressLabel(addressId);
  if (!label) return Response.json({ status: "invalid", error: "Unknown address." }, { status: 400 });
  const deps = depsFor(req);
  if (!deps) return Response.json({ status: "unavailable", error: "Alerts are not set up here." }, { status: 503 });
  try {
    const r = await subscribe({ email, addressId, label }, deps);
    return Response.json(r, { status: r.status === "invalid" ? 400 : 200 });
  } catch (e) {
    console.error("subscribe failed", (e as Error).message);
    return Response.json({ status: "unavailable", error: "Something went wrong. Please try later." }, { status: 503 });
  }
}
