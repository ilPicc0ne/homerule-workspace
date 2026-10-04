import type { Category, Rule } from "./types";

/*
  Plain-language words for the address page (mockup v3, PRD "Words"): grade 6–8, state the fact,
  let the reader conclude, never invite comparing the renter's own number to a cap.
  Keyed by rule_id from web/data/live/rules.json. A rule without an entry falls back to its
  extracted summary, so a new rule still shows up (just less plainly worded).

  weak: the rule is a notice or a limit on protection, not a protection the tile can call
  "There's a rule" (e.g. Massachusetts bars rent control; a 14-day notice rule).
*/

export type Plain = { line: string; expl?: string; weak?: boolean };

export const PLAIN: Record<string, Plain> = {
  // ---- California (state)
  "CA-RENT-1947.12": {
    line: "California limits yearly rent increases to 5% plus inflation, never more than 10%. Some buildings are exempt.",
    expl: "The state cap covers many apartments built more than 15 years ago. It doesn't cover some newer buildings and some single-family homes. Your unit may differ.",
  },
  "CA-EVICT-1946.2": {
    line: "After a year, a landlord needs a reason the law allows to end your tenancy.",
    expl: "The reason has to be written in the notice. Some buildings are exempt. Your unit may differ.",
  },
  "CA-DEP-1950.5": {
    line: "California's deposit limit is one month's rent.",
    expl: "In effect since Jul 1, 2024. Small landlords with few units have an exception.",
  },
  "CA-FEE-1950.6": {
    line: "California caps application fees at $30 per person, raised each year for inflation.",
    expl: "The fee can't be more than the landlord's real cost of checking you. There is no single official figure for 2026.",
  },
  "CA-SCREEN-12955": {
    line: "A landlord can't turn you down because of who you are or how you pay rent (e.g. a voucher).",
    expl: "California fair housing law protects many traits, including how you pay rent, such as a Section 8 voucher.",
  },
  "CA-ALG-16729": {
    line: "California bans shared pricing software used to fix prices (since 2026).",
    expl: "Since Jan 1, 2026, it is against the law to use or share a common pricing algorithm as part of a deal to restrain trade.",
  },
  // ---- San Francisco
  "CA-SAN-FRANCISCO-RENT-37.3": {
    line: "The city's yearly limit for rent-controlled units is 1.6% (Mar 2026–Feb 2027). Some units and increases are exempt. The Rent Board can check your notice.",
    expl: "San Francisco rent control covers buildings first approved for living before June 13, 1979. Your unit may differ.",
  },
  "CA-SAN-FRANCISCO-EVICT-37.9": {
    line: "In San Francisco, a landlord needs one of the reasons the law allows to evict.",
    expl: "The reason must be the main motive for the eviction. If you have to move out for a reason that is not your fault, the law sets moving payments.",
  },
  "CA-SAN-FRANCISCO-ALG-37.10C": {
    line: "San Francisco bans software that sets rents from other landlords' private data (since 2024).",
    expl: "Since Oct 14, 2024, no one may sell or use such software to set rents or decide how many units stay empty.",
  },
  "CA-SAN-FRANCISCO-DEP-37.6": {
    line: "In San Francisco, your deposit earns interest: 4.2% for Mar 2026–Feb 2027.",
    expl: "The landlord pays this interest to you each year.",
  },
  // ---- Los Angeles
  "CA-LOS-ANGELES-RENT-151.06": {
    line: "Los Angeles rent control limits yearly increases for covered units (3% for Jul 2025–Jun 2026).",
    expl: "LA rent control generally covers buildings first built on or before Oct 1, 1978. Your unit may differ.",
  },
  "CA-LOS-ANGELES-EVICT-165.03": {
    line: "In Los Angeles, a landlord needs a reason the law allows to end your tenancy.",
    expl: "This covers most rentals after six months or when the first lease ends, whichever comes first.",
  },
  // ---- Berkeley
  "CA-BERKELEY-RENT-13.76.110A": { line: "Berkeley's yearly increase for fully covered units is capped at 5%." },
  "CA-BERKELEY-EVICT-BerkeleyMuni": { line: "In Berkeley, a landlord can't evict for unpaid rent below one month of fair market rent." },
  "CA-BERKELEY-EVICT-BerkeleyRent": { line: "Berkeley sets moving payments for owner move-in evictions ($19,413 in 2026)." },
  "CA-BERKELEY-FEE-13.78": { line: "Berkeley caps tenant screening fees ($68.96 in 2026)." },
  "CA-BERKELEY-SCREEN-13.106": { line: "In Berkeley, a landlord can't ask about your criminal history. Some homes are exempt." },
  "CA-BERKELEY-ALG-13.63.030": { line: "Berkeley bans landlords from using shared pricing software to set rents." },
  "CA-BERKELEY-DEP-BerkeleyRent": { line: "In Berkeley, your deposit earns interest in covered units." },
  // ---- San Diego, Santa Ana
  "CA-SAN-DIEGO-EVICT-98.0704": { line: "In San Diego, a landlord needs a reason the law allows to end your tenancy. Some buildings are exempt." },
  "CA-SAN-DIEGO-ALG-98.1103": { line: "San Diego bans landlords from using software that sets rents." },
  "CA-SANTA-ANA-RENT-SantaAnaRent": { line: "Santa Ana limits yearly rent increases for older buildings (2.87% for Sep 2026–Aug 2027)." },
  "CA-SANTA-ANA-EVICT-SantaAnaJust": { line: "In Santa Ana, after 30 days a landlord needs a reason the law allows to end your tenancy." },
  // ---- Massachusetts (state)
  "MA-RENT-40P": {
    line: "Massachusetts doesn't allow rent control, so there's no city limit on increases. Your landlord still has to give proper notice.",
    expl: "State law says no city or town may have rent control, unless it accepts a newer state chapter.",
    weak: true,
  },
  "MA-EVICT-186": {
    line: "For unpaid rent, a landlord must give you 14 days' written notice. Our sources have no rule requiring a reason the law allows.",
    expl: "A letter telling you to move out for unpaid rent must give at least 14 days.",
    weak: true,
  },
  "MA-DEP-186": {
    line: "Massachusetts' deposit limit is the first month's rent.",
    expl: "Before you move in, a landlord may only ask for first and last month's rent, a deposit and the cost of a new lock and key.",
  },
  "MA-FEE-186": {
    line: "Massachusetts doesn't allow application fees.",
    expl: "Before you move in, a landlord may only ask for first and last month's rent, a deposit and the cost of a lock and key.",
  },
  "MA-FEE-112": {
    line: "A broker's fee is paid by whoever hired the broker (since Aug 2025).",
  },
  "MA-SCREEN-151B": {
    line: "A landlord can't turn you down for receiving public assistance or a housing subsidy.",
    expl: "This includes vouchers. It covers publicly assisted housing and buildings with several units.",
  },
  // ---- Boston, Cambridge
  "MA-BOSTON-EVICT-10-11.7": {
    line: "In Boston, every letter telling you to move out must come with a Notice of Tenant's Rights and Resources.",
    expl: "The rule covers almost every Boston rental. It doesn't cover hospitals, nursing homes and some short-stay non-profit homes, and our records can't tell those apart. Our sources have no Massachusetts rule requiring a reason the law allows to evict.",
    weak: true,
  },
  "MA-BOSTON-SCREEN-BostonFairCh": {
    line: "In some Boston housing, a landlord can't turn down everyone with a record; each person must be looked at.",
    expl: "Boston's Fair Chance policy covers housing with City funding or income-restricted units.",
  },
  "MA-BOSTON-SCREEN-BostonFairHo": { line: "Boston bans housing discrimination on many grounds." },
  "MA-CAMBRIDGE-EVICT-8.71": { line: "In Cambridge, a landlord must give you a tenants' rights guide when taking legal steps to evict.", weak: true },
  "MA-CAMBRIDGE-SCREEN-14.04": { line: "In Cambridge, a landlord must use the same standards for every applicant." },
  // ---- New Jersey (state)
  "NJ-RENT-2A:18-61.1": { line: "New Jersey has no state limit on rent increases, but an increase can't be unconscionable.", weak: true },
  "NJ-RENT-2A:42-84.5": { line: "New buildings are exempt from city rent control for 30 years.", weak: true },
  "NJ-EVICT-2A:18-61.1": {
    line: "A landlord needs a reason the law allows to evict, and a court must approve.",
    expl: "This also covers refusing to renew a lease. Some owner-occupied homes are exempt.",
  },
  "NJ-DEP-46:8-21.2": { line: "New Jersey's deposit limit is 1.5 months' rent." },
  "NJ-FEE-46:8-18.1": { line: "New Jersey caps application fees at $50, since May 1, 2026.", expl: "It doesn't cover one- or two-family homes." },
  "NJ-SCREEN-46:8-55": { line: "A landlord can't ask about criminal records before a conditional offer." },
  "NJ-SCREEN-46:8-56": { line: "A landlord can't judge you on arrests without a conviction or on sealed records." },
  "NJ-SCREEN-46:8-58": { line: "A landlord can't advertise that people with records won't be considered." },
  "NJ-SCREEN-46:8-60": { line: "A landlord can't make you take a drug or alcohol test." },
  "NJ-SCREEN-10:5-12": { line: "A landlord can't turn you down because of who you are." },
  "NJ-ALG-56:9-23": { line: "From Jul 1, 2027, landlords can't use software that sets rents in New Jersey." },
  // ---- Hoboken, Jersey City
  "NJ-HOBOKEN-ALG-Hobokenordin": { line: "Hoboken bans software that sets rents (since July 2025)." },
  "NJ-HOBOKEN-RENT-10:54": { line: "Hoboken has its own rent control. You can ask the city to calculate your legal rent." },
  "NJ-HOBOKEN-RENT-18:54": { line: "In Hoboken, rent can be cut when services or upkeep get worse." },
  "NJ-HOBOKEN-RENT-18:66": { line: "Hoboken sets rules for when a unit leaves rent control after a move-out.", weak: true },
  "NJ-HOBOKEN-RENT-3": { line: "Hoboken sets rules for when a unit leaves rent control after a move-out.", weak: true },
  "NJ-JERSEY-CITY-ALG-218-12": { line: "Jersey City bans landlords from paying for rent-setting services." },
  "NJ-JERSEY-CITY-ALG-218-12.3": { line: "In Jersey City, a rent increase must come with a sworn statement that no rent-setting software was used." },
  "NJ-JERSEY-CITY-RENT-JerseyCityLa": { line: "Jersey City has rent control. You can file a petition if you think your rent is illegal." },
};

/** The six topics, in the v3 order and groups. */
export type TopicId = "rent" | "evict" | "soft" | "dep" | "fee" | "scr";

export const TOPICS: { id: TopicId; cat: Category; group: "live" | "move"; title: string; short: string; q: string; icon: string }[] = [
  { id: "rent", cat: "rent_increase_limits", group: "live", title: "Rent increases", short: "Rent", q: "What are the rules on rent increases?", icon: "i-rent" },
  { id: "evict", cat: "just_cause_eviction", group: "live", title: "Eviction", short: "Eviction", q: "When can they end my tenancy?", icon: "i-door" },
  { id: "soft", cat: "algorithmic_rent_setting", group: "live", title: "Software that sets rents", short: "Software", q: "Can software be used to set my rent?", icon: "i-chip" },
  { id: "dep", cat: "security_deposits", group: "move", title: "Security deposit", short: "Deposit", q: "How much deposit can they ask for?", icon: "i-safe" },
  { id: "fee", cat: "application_screening_fees", group: "move", title: "Application fees", short: "Fees", q: "What can they charge me to apply?", icon: "i-receipt" },
  { id: "scr", cat: "screening_restrictions", group: "move", title: "Tenant screening", short: "Screening", q: "What can they check about me?", icon: "i-id" },
];

export const GROUPS = [
  { id: "live", title: "While you live here" },
  { id: "move", title: "Moving in or out" },
] as const;

/** "Before you call, have ready" per topic (J7 helper). */
export const CALL_ITEMS: Partial<Record<TopicId, string[]>> = {
  rent: ["Your rent increase notice", "Your lease", "Your move-in date"],
  evict: ["Your notice to move out", "Your lease", "Your move-in date"],
};

/** Plain words for a building fact the engine says is missing. */
export const FACT_PLAIN: Record<string, { name: string; ask: string }> = {
  built: { name: "Year built", ask: "the year my building was built, or the date the city first approved it for living" },
  units: { name: "Number of units", ask: "how many rental units are in my building" },
  use_class: { name: "Type of building", ask: "what kind of building this is (apartment, condo, house)" },
  subsidised: { name: "Whether the building is subsidised", ask: "whether my building has subsidised or income-restricted units" },
  owner_type: { name: "Who owns the building", ask: "whether the owner is a person or a company" },
  owner_occupied: { name: "Whether the owner lives here", ask: "whether the owner lives in the building" },
};

/** A carve-out (an exemption or a loosening, e.g. "not restricted in initial rent") is not the
 *  topic's main rule, even when extraction tags it a protection. It never leads a tile. */
const CARVE_OUT = /\b(not (be )?restricted|unrestricted|exempt(s|ed|ion)?|do(es)? not apply|not subject to|excluded from)\b/i;
export const isCarveOut = (rule: Pick<Rule, "title" | "key_value" | "audit">) =>
  rule.audit?.model_extracted?.effect === "bars_or_limits_local_rules" || CARVE_OUT.test(`${rule.title} ${rule.key_value ?? ""}`);
