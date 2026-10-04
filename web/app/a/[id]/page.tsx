import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PinMap } from "@/components/dot-map";
import LiveUnavailable from "@/components/live-unavailable";
import { ancestry, getDataset, jurisdictionById } from "@/lib/data";
import { builtYear, formatRetrieved, unitsText } from "@/lib/format";
import { projectPanel } from "@/lib/geo";
import type { Address, Rule } from "@/lib/types";
import Dashboard from "./dashboard";

export function generateStaticParams() {
  const data = getDataset();
  return data ? data.addresses.filter((a) => a.demo).map((a) => ({ id: a.address_id })) : [];
}

export async function generateMetadata(props: PageProps<"/a/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const a = getDataset()?.addresses.find((x) => x.address_id === id);
  return { title: a ? `${a.street}, ${a.postal_city}` : "Address" };
}

const USE_WORDS: Record<string, string> = {
  apartment: "Apartments",
  condo: "Condominium",
  co_op: "Co-op",
  two_family: "Two-family home",
  single_family: "Single-family home",
  mixed_use: "Mixed use",
  subsidised_housing: "Subsidised housing",
};

function Unknown({ why }: { why: string }) {
  return (
    <>
      <span className="unknown-word">Unknown</span>
      <small>{why}</small>
    </>
  );
}

function Facts({ a }: { a: Address }) {
  const year = builtYear(a.facts.built);
  const units = unitsText(a.facts.units);
  return (
    <>
      <h2 className="rail-title">Building facts</h2>
      <dl className="facts">
        <dt>Year built</dt>
        <dd>{year ? <>{year}<small>Stands in for the certificate of occupancy date</small></> : <Unknown why="Not in the public record" />}</dd>
        <dt>Units</dt>
        <dd>
          {units ? (
            <>
              {units}
              {(a.fact_sources.units?.source.startsWith("parsed") || (a.fact_sources.units?.confidence ?? 1) < 0.9) && <small>Read from the use code, lower confidence</small>}
            </>
          ) : (
            <Unknown why="Not in the public record" />
          )}
        </dd>
        <dt>Use</dt>
        <dd>
          {a.facts.use_class ? USE_WORDS[a.facts.use_class] : <span className="unknown-word">Unknown</span>}
          <small>{a.source.use_description}</small>
        </dd>
        <dt>Owner</dt>
        <dd>
          <Unknown why="Owner type is never in the public data" />
        </dd>
      </dl>
      <p className="map-caption">
        Source: {a.source.dataset}, retrieved {formatRetrieved(a.source.retrieved_at)}.
      </p>
    </>
  );
}

function Where({ a }: { a: Address }) {
  const chain = ancestry(a.jurisdictions.city);
  const county = jurisdictionById(a.jurisdictions.county);
  return (
    <>
      <h2 className="rail-title">Where this is</h2>
      <ol className="crumbs">
        {chain.map((j, i) => (
          <li key={j.id}>
            <Link href={`/j/${j.id}`} aria-current={i === chain.length - 1 ? "page" : undefined}>
              {j.legal_name.replace(/ city$/, "")}
            </Link>
          </li>
        ))}
      </ol>
      {a.legal_city_note && <p className="note">{a.legal_city_note}</p>}
      <p className="map-caption">
        No county rules for addresses inside a city here: {county?.legal_name} has no housing law in our sources.
      </p>
    </>
  );
}

export default async function AddressPage(props: PageProps<"/a/[id]">) {
  const { id } = await props.params;
  const data = getDataset();
  if (!data) return <LiveUnavailable />;
  const address = data.addresses.find((a) => a.address_id === id && a.demo);
  if (!address) notFound();

  const stack = new Set(Object.values(address.jurisdictions));
  const rules: Record<string, Rule> = {};
  for (const r of data.rules) if (stack.has(r.jurisdiction_id)) rules[r.rule_id] = r;

  const lookups: Record<string, (typeof data.lookups)[string][string]> = {};
  for (const [date, byAddress] of Object.entries(data.lookups)) lookups[date] = byAddress[id] ?? [];

  // The pin map frames the address's own city, not the whole metro panel.
  const cityPanel = { id: address.jurisdictions.city, label: address.postal_city, state: address.jurisdictions.state, cities: [address.jurisdictions.city] };
  const frame = projectPanel(cityPanel, data.addresses, 300, 12, 220);
  const simulation = data.meta.simulation?.address_id === id ? data.meta.simulation?.rule : undefined;
  const findings = [...stack].flatMap((j) => data.findings[j] ?? []);

  return (
    <Dashboard
      address={address}
      lookups={lookups}
      rules={rules}
      stops={data.meta.as_of_dates}
      fallback={data.meta.default_as_of}
      retrieved={data.meta.retrieved_at}
      simulation={simulation}
      findings={findings}
      rail={{
        map: <PinMap frame={frame} pinId={address.address_id} label={address.street} />,
        where: <Where a={address} />,
        facts: <Facts a={address} />,
      }}
    />
  );
}
