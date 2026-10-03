type Status = "inforce" | "upcoming" | "pending" | "unknown";

function StatusMark({ status }: { status: Status }) {
  return <span className={`mark mark-${status}`} aria-hidden="true" />;
}

const questions = [
  { q: "How much can my rent go up?", topic: "Rent increase limits" },
  { q: "When can they end my tenancy?", topic: "Reasons, notice and relocation money" },
  { q: "How much deposit can they ask?", topic: "Security deposits" },
  { q: "What can they charge me to apply?", topic: "Application and screening fees" },
  { q: "What can they check about me?", topic: "Screening restrictions" },
  { q: "Can rent-setting software be used on my rent?", topic: "Algorithmic rent-setting" },
];

const coverage = [
  { state: "California", cities: ["Los Angeles", "San Francisco", "San Diego", "Berkeley", "Santa Ana"] },
  { state: "New Jersey", cities: ["Jersey City", "Hoboken", "Newark"] },
  { state: "Massachusetts", cities: ["Boston", "Cambridge"] },
];

export default function Home() {
  return (
    <>
      <p className="notice" role="note">
        <strong>Not legal advice.</strong> HomeRule shows published housing rules that may apply to an address, with
        quotes and dates.
      </p>

      <header className="wrap masthead">
        <span className="plate plate-small" aria-label="HomeRule">
          HomeRule
        </span>
        <span className="soon">Coming soon</span>
      </header>

      <main>
        <section className="wrap hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Your rights as a renter, for your exact address.</h1>
            <p className="lede">
              Enter a US apartment address and see which housing rules apply there today and what is about to change.
              Every answer is quoted from the law and dated. Where the data can&rsquo;t decide, HomeRule says
              &ldquo;unknown&rdquo; and tells you which fact is missing.
            </p>
          </div>

          <figure className="example">
            <div className="sign" aria-hidden="true">
              <span className="sign-number">3515</span>
              <span className="sign-street">Fillmore St</span>
            </div>
            <div className="post" aria-hidden="true" />
            <div className="answer">
              <figcaption className="answer-tag">
                <span className="tag">Example</span>
                <span>Illustrative, not a live answer</span>
              </figcaption>
              <p className="answer-where">
                <span className="sr-only">Address: 3515 Fillmore St, </span>San Francisco, California. Built 1926, 21
                units.
              </p>
              <h2 className="answer-q">How much can my rent go up?</h2>

              <div className="rule">
                <p className="rule-status">
                  <StatusMark status="inforce" />
                  <span>
                    <strong>Applies:</strong> San Francisco Rent Ordinance
                  </span>
                </p>
                <p className="rule-note">City rule. The state cap is replaced here by the stricter local rule.</p>
                <blockquote className="quote">
                  <p>
                    <mark>The ordinance text that sets the yearly increase appears here, word for word.</mark>
                  </p>
                </blockquote>
                <p className="rule-meta">
                  <span>S.F. Administrative Code, Chapter 37</span>
                  <span>Official text linked</span>
                </p>
              </div>

              <div className="rule rule-quiet">
                <p className="rule-status">
                  <StatusMark status="inforce" />
                  <span>
                    <strong>Replaced here:</strong> California rent cap
                  </span>
                </p>
                <p className="rule-note">State rule. Shown so you can see why it doesn&rsquo;t decide this address.</p>
              </div>

              <p className="asof">
                As of <time dateTime="2026-10-01">01.10.2026</time>
              </p>
            </div>
          </figure>
        </section>

        <section className="wrap band" aria-labelledby="questions-title">
          <h2 id="questions-title" className="section-title">
            Six questions, answered for your building
          </h2>
          <p className="section-lede">
            Each answer says whether a rule applies, where it comes from (state, county or city), and what it depends
            on.
          </p>
          <ul className="questions">
            {questions.map(({ q, topic }) => (
              <li key={q}>
                <span className="question">{q}</span>
                <span className="topic">{topic}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="wrap band" aria-labelledby="dates-title">
          <h2 id="dates-title" className="section-title">
            A model has a training cutoff. A law has an effective date.
          </h2>
          <p className="section-lede">
            Housing law changes often, and a rule that passed is not always a rule in force. HomeRule keeps each stage
            apart and shows the date that decides it.
          </p>

          <ol className="ruler" aria-label="How a rule is shown over time">
            <li className="ruler-item">
              <StatusMark status="inforce" />
              <div>
                <h3>Enacted, in force</h3>
                <p>Counts today. Shown with the date it took effect.</p>
              </div>
            </li>
            <li className="ruler-today">
              <span>The as-of date on every answer</span>
            </li>
            <li className="ruler-item">
              <StatusMark status="upcoming" />
              <div>
                <h3>Enacted, not yet effective</h3>
                <p>Shown with the date it starts. Not counted until that day.</p>
              </div>
            </li>
            <li className="ruler-item ruler-off">
              <StatusMark status="pending" />
              <div>
                <h3>Pending bill</h3>
                <p>Shown as proposed, never as law. No date until it passes.</p>
              </div>
            </li>
          </ol>

          <dl className="promises">
            <div>
              <dt>Quoted from the official law</dt>
              <dd>Every rule that applies carries the exact passage and a link to the official text.</dd>
            </div>
            <div>
              <dt>
                <StatusMark status="unknown" />
                An honest unknown
              </dt>
              <dd>
                When a fact about the building is missing, the answer names it and says where to check it, instead of
                guessing.
              </dd>
            </div>
            <div>
              <dt>Conflicts flagged, not decided</dt>
              <dd>When two rules point different ways, both are shown with their sources. HomeRule doesn&rsquo;t pick one.</dd>
            </div>
            <div>
              <dt>Alerts when the law changes</dt>
              <dd>Follow an address and get an email with the new rule, its date and its quote.</dd>
            </div>
          </dl>
        </section>

        <section className="wrap band" aria-labelledby="scope-title">
          <h2 id="scope-title" className="section-title">
            Where it works at launch
          </h2>
          <p className="section-lede">
            Three states, ten cities and 500 sample addresses. Outside them, HomeRule says it has no law for that place
            rather than guessing.
          </p>
          <div className="states">
            {coverage.map(({ state, cities }) => (
              <div key={state} className="state">
                <h3>{state}</h3>
                <ul>
                  {cities.map((city) => (
                    <li key={city} className="plate plate-city">
                      {city}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="wrap band" aria-labelledby="alerts-title">
          <div className="alerts">
            <h2 id="alerts-title" className="section-title">
              Hear when the law changes for your address
            </h2>
            <p className="section-lede">
              Email alerts are not open yet. Nothing on this page collects your address or email.
            </p>
            <div className="alerts-row">
              <label htmlFor="alert-email" className="sr-only">
                Email address (not available yet)
              </label>
              <input
                id="alert-email"
                type="email"
                placeholder="you@example.com"
                disabled
                aria-describedby="alerts-title"
              />
              <button type="button" disabled>
                Alerts coming soon
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap footer">
        <p>
          HomeRule shows published housing rules that may apply to an address, with quotes and dates. It is not legal
          advice and not a compliance certification. For advice on your situation, contact a tenant organization or a
          lawyer.
        </p>
        <p>
          Built at Hack-Nation 7 for the RealPage challenge &ldquo;Rental Housing Law Navigator&rdquo;.
        </p>
      </footer>
    </>
  );
}
