import AddressPreview from "./address-preview";
import { icons } from "./icons";

const questions = [
  { label: "Rent increases", icon: icons.rent },
  { label: "Eviction protection", icon: icons.shield },
  { label: "Deposits", icon: icons.key },
  { label: "Application fees", icon: icons.receipt },
  { label: "Screening", icon: icons.idcard },
  { label: "Rent-setting software", icon: icons.chip },
];

const trust = [
  { label: "Quoted from the law", icon: icons.quote },
  { label: "Dated, always", icon: icons.calendar },
  { label: "Honest when unsure", icon: icons.unsure },
];

export default function Home() {
  return (
    <>
      <header className="wrap top">
        <span className="brand">
          <span className="brand-mark">{icons.home}</span>
          HomeRule
        </span>
        <span className="pill pill-soft">Coming soon</span>
      </header>

      <main>
        <div className="wrap">
          <AddressPreview />
        </div>

        <section className="wrap section" aria-labelledby="questions-title">
          <h2 id="questions-title">Six questions, answered for your address</h2>
          <ul className="chips">
            {questions.map(({ label, icon }) => (
              <li key={label} className="chip">
                <span className="chip-icon">{icon}</span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="wrap section" aria-labelledby="trust-title">
          <h2 id="trust-title" className="sr-only">
            How every answer works
          </h2>
          <ul className="trust">
            {trust.map(({ label, icon }) => (
              <li key={label}>
                <span className="trust-icon">{icon}</span>
                {label}
              </li>
            ))}
          </ul>

          <div className="coverage">
            <p>
              <span>California</span>
              <span className="dot" aria-hidden="true">
                ·
              </span>
              <span>New Jersey</span>
              <span className="dot" aria-hidden="true">
                ·
              </span>
              <span>Massachusetts</span>
              <span className="cities">— 10 cities</span>
            </p>
          </div>
        </section>
      </main>

      <footer className="wrap footer">
        <p>Not legal advice. Shows published rules that may apply, with quotes and dates.</p>
        <p>Built at Hack-Nation 7 for the RealPage challenge.</p>
      </footer>
    </>
  );
}
