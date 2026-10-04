import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import { getDataset } from "@/lib/data";
import { fontVars } from "../fonts";
import { viewProps } from "../view-props";
import AddressPageView from "./address-page";
import "./v3.css";

/** The featured addresses are prebuilt; every other sample address renders on first request. */
export function generateStaticParams() {
  const data = getDataset();
  return data ? data.meta.demo_address_ids.map((id) => ({ id })) : [];
}

export async function generateMetadata(props: PageProps<"/a/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const a = getDataset()?.addresses.find((x) => x.address_id === id);
  return { title: a ? `${a.street}, ${a.postal_city}` : "Address" };
}

export default async function AddressPage(props: PageProps<"/a/[id]">) {
  const { id } = await props.params;
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  const address = data.addresses.find((a) => a.address_id === id);
  if (!address) notFound();
  const results = data.lookups[data.meta.default_as_of]?.[id] ?? [];
  return (
    <div className={fontVars}>
      <AddressPageView {...viewProps(data, address, results)} />
    </div>
  );
}
