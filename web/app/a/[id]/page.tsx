import AddressDateError from "@/components/address-date-error";
import { addressDates, requestedDate } from "@/lib/address-dates";
import { evaluateSample } from "@/lib/live-address";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import { getDataset } from "@/lib/data";
import { fontVars } from "../fonts";
import { viewProps } from "../view-props";
import AddressPageView from "./address-page";
import "./v3.css";

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
  const sp = await props.searchParams;
  const asOf = requestedDate(sp.as_of, data.meta.default_as_of);
  const dateControls = addressDates(data, address, asOf ?? data.meta.default_as_of);
  if (!asOf) return <AddressDateError config={dateControls} message="Choose a real date between 1900-01-01 and 2100-12-31." />;
  const evaluated = await evaluateSample(data, id, asOf);
  if (!evaluated) return <AddressDateError config={dateControls} message={`We could not calculate ${asOf}. Try again, or return to the dataset date.`} />;
  return (
    <div className={fontVars}>
      <AddressPageView {...viewProps(data, address, evaluated.results, { asOf })} dateControls={dateControls} liveEngine={evaluated.engine} snapshotFallback={evaluated.mode === "snapshot"} />
    </div>
  );
}
