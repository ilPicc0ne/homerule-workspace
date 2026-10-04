import Link from "next/link";
import { icons } from "@/components/icons";
import LiveUnavailable from "@/components/live-unavailable";
import SearchBox from "@/components/search-box";
import { getDataset, jurisdictions } from "@/lib/data";
import { buildIndex } from "@/lib/demo-search";
import { CATEGORIES, QUESTION } from "@/lib/law";
import type { Category } from "@/lib/types";

const questionIcon: Record<Category, React.ReactNode> = {
  rent_increase_limits: icons.rent,
  just_cause_eviction: icons.shield,
  security_deposits: icons.key,
  application_screening_fees: icons.receipt,
  screening_restrictions: icons.idcard,
  algorithmic_rent_setting: icons.chip,
};

const trust = [
  { label: "Quoted from the law", icon: icons.quote },
  { label: "Dated, always", icon: icons.calendar },
  { label: "Honest when unsure", icon: icons.unsure },
];

export default function Home() {
  const data = getDataset();
  if (!data) return <LiveUnavailable />;

  const index = buildIndex(data.addresses, jurisdictions);
  const demo = data.meta.demo_address_ids
    .map((id) => data.addresses.find((a) => a.address_id === id))
    .filter((a) => a !== undefined);
  const states = jurisdictions.filter((j) => j.level === "state");

  return (
    <main>
      <section className="wrap hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Your rights as a renter, for your exact address.</h1>
        <p className="hero-sub">See which housing rules apply to your home, today and next.</p>
        <SearchBox index={index} />
        <ul className="try" aria-label="Example addresses">
          {demo.map((a) => (
            <li key={a.address_id}>
              <Link className="try-chip" href={`/a/${a.address_id}`}>
                {a.street}
                <span>{a.postal_city}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap landing-section" aria-labelledby="questions-title">
        <h2 id="questions-title">Six questions, answered for your address</h2>
        <ul className="tiles">
          {CATEGORIES.map((c) => (
            <li key={c} className="tile">
              {questionIcon[c]}
              {QUESTION[c]}
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap landing-section" aria-labelledby="trust-title">
        <h2 id="trust-title" className="sr-only">
          How every answer works
        </h2>
        <ul className="trust">
          {trust.map(({ label, icon }) => (
            <li key={label}>
              {icon}
              {label}
            </li>
          ))}
        </ul>
        <p className="coverage">
          {states.map((s, i) => (
            <span key={s.id}>
              {i > 0 && <span className="coverage-sep" aria-hidden="true" />}
              <Link href={`/j/${s.id}`}>{s.legal_name}</Link>
            </span>
          ))}
          <br />
          <span className="muted">3 states and 10 cities. Anything else says &ldquo;not covered&rdquo;, never a guess.</span>
        </p>
        <p className="muted" style={{ textAlign: "center" }}>
          Use Claude or ChatGPT? <Link href="/connect">Make your chatbot rent-law aware</Link>.
        </p>
        <p className="tagline">A model has a training cutoff. A law has an effective date.</p>
      </section>
    </main>
  );
}
