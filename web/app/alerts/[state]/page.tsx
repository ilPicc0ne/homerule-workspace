import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addressLabel, asOfText } from "@/lib/alerts/server";

/* The pages the email links land on: /alerts/confirmed?a=<id>, /alerts/unsubscribed, /alerts/invalid. */

const TITLES = { confirmed: "Alerts are on", unsubscribed: "You are unsubscribed", invalid: "This link does not work" } as const;
type State = keyof typeof TITLES;

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

export default async function AlertsState(props: PageProps<"/alerts/[state]">) {
  const { state } = await props.params;
  if (!(state in TITLES)) notFound();
  const s = state as State;
  const sp = await props.searchParams;
  const id = typeof sp.a === "string" ? sp.a : "";
  const label = id ? addressLabel(id) : null;
  return (
    <main className="wrap narrow empty">
      <h1>{TITLES[s]}</h1>
      {s === "confirmed" && (
        <>
          <p>
            Thanks. We will email you when a housing rule changes{label ? <> for <strong>{label}</strong></> : null}. We send
            no other mail. Each email has a link to stop.
          </p>
          {label && (
            <p>
              <Link href={`/a/${encodeURIComponent(id)}`}>Back to this address</Link>
            </p>
          )}
        </>
      )}
      {s === "unsubscribed" && <p>We removed your email for this address. You will get no more alerts for it.</p>}
      {s === "invalid" && <p>The link may be old or already used. You can ask for alerts again on any address page.</p>}
      <p className="muted">Not legal advice · Data as of {asOfText()}</p>
      <p>
        <Link href="/">Search an address</Link>
      </p>
    </main>
  );
}
