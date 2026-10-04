import type { Result, Rule } from "./types";

/*
  "What we don't know yet" on a tile: one line per missing fact, worded from the engine's results.
  Pure and dependency-free (type imports only), so node --test can load it directly.

  - The engine names missing building facts in `missing_facts`. A building whose year equals a
    certificate-of-occupancy cutoff year has no missing fact there: the year is known, it just can't
    settle the cutoff. The engine says so in its explanation ("built 1978 (…), but the cutoff is on or
    before October 1, 1978 and the year alone can't settle it"); that becomes the approval-date line.
  - A fact two rules depend on is one line, not two.
  - The order follows the results passed in (the tile's lead rule first), so the fact that decides
    the lead rule comes first.
  - "An exception in the law's text" only when a rule has nothing better.
*/

export type MissingLine = { fact: string; why: string };

const CUTOFF = /built (\d{4}(?:–\d{4})?)(?: \([^)]*\))?, but the cutoff is (.+?) and the year alone can't settle it/;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The approval-date line when the explanation names a cutoff the build year can't settle, else null. */
export function cutoffLine(explanation: string, office: string | null): MissingLine | null {
  const m = CUTOFF.exec(explanation);
  if (!m) return null;
  const who = office ? `${office} or your landlord can tell you` : "Your landlord or the city's building department can tell you";
  return {
    fact: "When the city first approved the building for living in",
    why: `Built in ${m[1]}. The rule depends on whether the city first approved it ${m[2]}, and the year alone can't tell. ${who}: ask for the certificate-of-occupancy date.`,
  };
}

export function missingFacts(unknown: Result[], rules: Record<string, Pick<Rule, "title">>, office: string | null): MissingLine[] {
  const lines: (MissingLine & { key: string; n: number })[] = [];
  const add = (key: string, line: MissingLine) => {
    const seen = lines.find((l) => l.key === key);
    if (!seen) return void lines.push({ ...line, key, n: 1 });
    seen.n++;
    if (seen.n !== 2) return;
    if (key === "text") seen.why = "More than one rule here has an exception our building records can’t check. The office below can tell you.";
    else if (seen.why.endsWith("depends on it, and our data doesn't say.")) seen.why = "More than one rule here depends on it, and our data doesn't say.";
  };
  for (const r of unknown) {
    const rule = rules[r.rule_id];
    const co = cutoffLine(r.explanation ?? "", office);
    if (co) add("certificate_of_occupancy", co);
    for (const f of r.missing_facts ?? []) add(f.toLowerCase(), { fact: cap(f), why: `${rule.title} depends on it, and our data doesn't say.` });
    if (!co && !r.missing_facts?.length)
      add("text", { fact: "An exception in the law’s text", why: `${rule.title}: the rule has an exception our building records can’t check. The office below can tell you.` });
  }
  return lines.map(({ fact, why }) => ({ fact, why }));
}
