import contactsFile from "../contracts/contacts.json" with { type: "json" };

/*
  Who-to-ask contacts per jurisdiction x topic (contracts/contacts.json). Pure (relative imports
  only), so the address page and the MCP tools share one lookup and node --test can load it.
*/

export type Contact = {
  name: string;
  phone: string | null;
  tel: string | null;
  url: string;
  whatFor: string;
  free: boolean;
  eligibility: string | null;
  sourceUrl: string;
};

type ContactEntry = { jurisdiction: string; category: string; contacts: Record<string, string | null>[] };
const CONTACTS = (contactsFile as unknown as { entries: ContactEntry[] }).entries;

/** Lookup order from contracts/contacts.json: city+topic, city+*, state+topic, state+*. */
export function contactFor(city: string | null, state: string, category: string): Contact | null {
  const keys: [string | null, string][] = [
    [city, category],
    [city, "*"],
    [state, category],
    [state, "*"],
  ];
  for (const [j, c] of keys) {
    if (!j) continue;
    const e = CONTACTS.find((x) => x.jurisdiction === j && x.category === c);
    const k = e?.contacts[0];
    if (k) {
      return {
        name: String(k.name),
        phone: k.phone_display ?? null,
        tel: k.phone ?? null,
        url: String(k.url),
        whatFor: String(k.what_for ?? ""),
        free: /\bfree\b/i.test(String(k.what_for ?? "")),
        eligibility: k.eligibility ?? null,
        sourceUrl: String(k.source_url),
      };
    }
  }
  return null;
}
