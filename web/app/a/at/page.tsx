import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import { getDataset } from "@/lib/data";
import { resolveQuery } from "@/lib/resolve/resolve.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";
import { flagGap, typedAddress } from "@/lib/typed-address.ts";
import AddressPageView from "../[id]/address-page";
import "../[id]/v3.css";
import { fontVars } from "../fonts";
import { viewProps } from "../view-props";

/*
  /a/at?q=<typed address>: the same one-view page for an address outside the 500 samples
  (e.g. 4801 E 3rd St, East LA, unincorporated). The resolver (Census) finds the legal
  jurisdictions; a sample address redirects to its own page; anything else that isn't an
  address in our 3 states goes to /where. The provisional results come from lib/typed-address.ts
  (shared with the MCP tool get_address).
*/

export const metadata: Metadata = { title: "Address" };

export default async function TypedAddressPage(props: PageProps<"/a/at">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  if (!q) redirect("/");

  const r = await resolveQuery(q, { fetch, samples: sampleIndex() });
  if (r.kind !== "address" || r.coverage === "not_covered") redirect(`/where?q=${encodeURIComponent(q)}`);
  if (r.sample) redirect(`/a/${r.sample.address_id}`);

  const t = typedAddress(r, data.rules, q);
  if (!t) redirect(`/where?q=${encodeURIComponent(q)}`);
  const vp = viewProps(data, t.address, t.results, { typed: true, legalNote: t.legalNote });
  flagGap(vp.view, t.gap);
  return (
    <div className={fontVars}>
      <AddressPageView {...vp} />
    </div>
  );
}
