import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LiveUnavailable from "@/components/live-unavailable";
import SourceTag from "@/components/source-tag";
import { childrenOf, getDataset, jurisdictionById, jurisdictions } from "@/lib/data";
import { jurisdictionPageData } from "@/lib/jurisdiction-view.ts";
import type { Jurisdiction } from "@/lib/types";
import RulesByQuestion from "./rules-by-question";

export const dynamicParams = false;

export function generateStaticParams() {
  return jurisdictions.map((j) => ({ id: j.id }));
}

const name = (j: Jurisdiction) => j.legal_name.replace(/ city$/, "");

export async function generateMetadata(props: PageProps<"/j/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const j = jurisdictionById(id);
  return { title: j ? name(j) : "Jurisdiction" };
}

const LEVEL_SUB = { state: "State", county: "County", city: "City" } as const;

export default async function JurisdictionPage(props: PageProps<"/j/[id]">) {
  const { id } = await props.params;
  const j = jurisdictionById(id);
  if (!j) notFound();
  const data = getDataset();
  if (!data) return <LiveUnavailable />;

  // Same data as the MCP get_jurisdiction (lib/jurisdiction-view.ts).
  const { chain, rules, children, inPlace, demo } = jurisdictionPageData(data, id)!;

  return (
    <main className="wrap narrow" style={{ maxWidth: "52rem" }}>
      <div className="page-head">
        <ol className="crumbs" aria-label="Jurisdiction">
          {chain.map((x, i) => (
            <li key={x.id}>
              <Link href={`/j/${x.id}`} aria-current={i === chain.length - 1 ? "page" : undefined}>
                {name(x)}
              </Link>
            </li>
          ))}
        </ol>
        <h1 style={{ marginTop: "0.75rem" }}>{name(j)}</h1>
        <p className="page-sub">
          {LEVEL_SUB[j.level]}
          {j.aliases.length > 0 && j.level === "city" ? `. Includes ${j.aliases.filter((a) => a.length > 3).slice(0, 6).join(", ")}` : ""}{" "}
          <SourceTag />
        </p>

        {j.level === "county" && (
          <p className="note">No county rules: city and state law apply. The corpus has no county housing law, and every sample address is inside a city.</p>
        )}

        {children.length > 0 && (
          <div style={{ marginTop: "1.25rem" }}>
            <p className="rail-title">{j.level === "state" ? "Counties and cities" : "Cities"}</p>
            <div className="children">
              {children.flatMap((c) =>
                c.level === "county"
                  ? childrenOf(c.id).map((city) => (
                      <Link key={city.id} className="try-chip" href={`/j/${city.id}`}>
                        {name(city)}
                        <span>{c.legal_name}</span>
                      </Link>
                    ))
                  : [
                      <Link key={c.id} className="try-chip" href={`/j/${c.id}`}>
                        {name(c)}
                      </Link>,
                    ],
              )}
            </div>
          </div>
        )}

        <p className="muted small" style={{ marginTop: "1.25rem" }}>
          {inPlace.length > 0 ? `${inPlace.length} sample addresses here.` : "No sample addresses here."}{" "}
          {demo.length > 0 && (
            <>
              Demo address{demo.length > 1 ? "es" : ""}:{" "}
              {demo.map((a, i) => (
                <span key={a.address_id}>
                  {i > 0 && ", "}
                  <Link href={`/a/${a.address_id}`}>{a.street}</Link>
                </span>
              ))}
              .
            </>
          )}
        </p>
      </div>

      <RulesByQuestion
        rules={rules}
        stops={data.meta.as_of_dates}
        fallback={data.meta.default_as_of}
        retrieved={data.meta.retrieved_at}
        placeName={name(j)}
      />
    </main>
  );
}
