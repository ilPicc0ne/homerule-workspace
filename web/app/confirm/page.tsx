import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY } from "@/lib/alerts/confirm-email";
import { asOfText } from "@/lib/alerts/server";

/* /confirm?t=<token>: the link in the confirmation email. One button that POSTs: mail scanners open GET links,
   so opening this page never confirms anything on its own. */

export const metadata: Metadata = { title: "Confirm alerts", robots: { index: false } };

export default async function Confirm(props: PageProps<"/confirm">) {
  const sp = await props.searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  return (
    <main className="wrap narrow empty">
      <h1>Turn on alerts?</h1>
      {t ? (
        <form method="post" action="/api/confirm">
          <input type="hidden" name="t" value={t} />
          <p>One tap and we email you when a housing rule for this address changes. Nothing else.</p>
          <p>
            <button type="submit" className="btn btn-primary">
              Yes, send me alerts
            </button>
          </p>
          <p className="muted">{PRIVACY}</p>
        </form>
      ) : (
        <p>This link is missing its code. Open the link from the email again.</p>
      )}
      <p className="muted">Not legal advice · Data as of {asOfText()}</p>
      <p>
        <Link href="/">Search an address</Link>
      </p>
    </main>
  );
}
