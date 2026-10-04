import type { Metadata } from "next";
import Link from "next/link";
import { addressLabel } from "@/lib/alerts/server";

/* /unsubscribe?a=<address_id>&t=<token>: the unsubscribe link in every email. One button that POSTs (link scanners
   open GET links); mail apps use the one-click POST in the List-Unsubscribe header instead. */

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe(props: PageProps<"/unsubscribe">) {
  const sp = await props.searchParams;
  const a = typeof sp.a === "string" ? sp.a : "";
  const t = typeof sp.t === "string" ? sp.t : "";
  const label = a ? addressLabel(a) : null;
  return (
    <main className="wrap narrow empty">
      <h1>Stop alerts?</h1>
      {a && t ? (
        <form method="post" action={`/api/unsubscribe?a=${encodeURIComponent(a)}&t=${encodeURIComponent(t)}`}>
          <input type="hidden" name="from" value="page" />
          <p>We will stop emailing you about {label ? <strong>{label}</strong> : "this address"} and delete your email for it.</p>
          <p>
            <button type="submit" className="btn btn-primary">
              Unsubscribe
            </button>
          </p>
        </form>
      ) : (
        <p>This link is incomplete. Open the unsubscribe link from the email again.</p>
      )}
      <p>
        <Link href="/">Search an address</Link>
      </p>
    </main>
  );
}
