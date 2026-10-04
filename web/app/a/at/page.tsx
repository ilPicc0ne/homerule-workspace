import AddressDateError from "@/components/address-date-error";
import { addressDates, requestedDate } from "@/lib/address-dates";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import { getDataset } from "@/lib/data";
import { resolveQuery } from "@/lib/resolve/resolve.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";
import { liveEngine } from "@/lib/live-engine.ts";
import { flagGap, typedAddress } from "@/lib/typed-address.ts";
import AddressPageView from "../[id]/address-page";
import "../[id]/v3.css";
import { fontVars } from "../fonts";
import { viewProps } from "../view-props";

/*
  /a/at?q=<typed address>: the same one-view page for an address outside the 500 samples
  (e.g. 4801 E 3rd St, East LA, unincorporated). The resolver (Census) finds the legal
  jurisdictions; a sample address redirects to its own page; anything else that isn't an
  address in our 3 states goes to /where. The live Python engine evaluates unknown
  building facts; lib/typed-address.ts supplies the existing fallback on failure.
*/

export const metadata: Metadata = { title: "Address" };

export default async function TypedAddressPage(props: PageProps<"/a/at">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  if (!q) redirect("/");

  // Date-only navigation reuses the jurisdiction lookup; rule evaluation stays uncached.
  const r = await resolveQuery(q, {
    fetch: (url, init) => fetch(url, { ...init, next: { revalidate: 3600 } }),
    samples: sampleIndex(),
  });
  if (r.kind !== "address" || r.coverage === "not_covered") redirect(`/where?q=${encodeURIComponent(q)}`);
  if (r.sample) {
    const selected = typeof sp.as_of === "string" ? `?as_of=${encodeURIComponent(sp.as_of)}` : "";
    redirect(`/a/${r.sample.address_id}${selected}`);
  }

  const t = typedAddress(r, data.rules, q);
  if (!t) redirect(`/where?q=${encodeURIComponent(q)}`);
  const asOf = requestedDate(sp.as_of, data.meta.default_as_of);
  const dateControls = addressDates(data, t.address, asOf ?? data.meta.default_as_of);
  if (!asOf) return <AddressDateError config={dateControls} message="Choose a real date between 1900-01-01 and 2100-12-31." />;
  const live = await liveEngine(r, data.rules, asOf);
  if (!live && asOf !== data.meta.default_as_of)
    return <AddressDateError config={dateControls} message={`We could not calculate ${asOf}. Try Show date again, or return to the dataset date.`} />;
  const vp = viewProps(data, t.address, live?.results ?? t.results, { typed: true, legalNote: t.legalNote, asOf });
  flagGap(vp.view, t.gap);
  return (
    <div className={fontVars}>
      <AddressPageView {...vp} liveEngine={live?.engine} dateControls={dateControls} />
    </div>
  );
}
