// Street clean-up before a Census call (docs/ARCHITECTURE.md B.1), and a key for matching typed
// streets against the sample addresses.

const SUFFIX: Record<string, string> = {
  AV: "AVE",
  AVENUE: "AVE",
  BLV: "BLVD",
  BOULEVARD: "BLVD",
  STREET: "ST",
  ROAD: "RD",
  DRIVE: "DR",
  PLACE: "PL",
  COURT: "CT",
  LANE: "LN",
  TERRACE: "TER",
  PARKWAY: "PKWY",
  SQUARE: "SQ",
  HIGHWAY: "HWY",
  CIRCLE: "CIR",
  // Short forms the sample CSV uses beside the USPS ones ("4115 LINCOLN WY", "521 ARGUELLO BL").
  WAY: "WAY",
  WY: "WAY",
  BL: "BLVD",
  PARK: "PK",
  ALLEY: "ALY",
};

/** Street suffixes, full and short ("COURT", "CT", "WY"), upper case. */
const SUFFIXES = new Set([...Object.keys(SUFFIX), ...Object.values(SUFFIX)]);
export const isStreetSuffix = (word: string) => SUFFIXES.has(word.toUpperCase());

const DIRECTION: Record<string, string> = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };

export type NormalisedStreet = {
  /** Census-ready street line, or null when there is no house number to geocode. */
  street: string | null;
  changes: string[];
};

export function normaliseStreet(raw: string): NormalisedStreet {
  const changes: string[] = [];
  let s = raw.toUpperCase().replace(/\s+/g, " ").trim();

  // Trailing dots on abbreviations: "AVE." → "AVE", "ST. PAULS" → "ST PAULS".
  const undotted = s.replace(/\.(?=\s|$)/g, "");
  if (undotted !== s) s = undotted;

  const unit = s.replace(/\s+(APT|UNIT|STE|SUITE|#)\s*\S+$/, "").replace(/\s+#\S+$/, "");
  if (unit !== s) {
    changes.push("dropped unit number");
    s = unit;
  }

  const lot = s.replace(/\s+LOT\s+\S+$/, "");
  if (lot !== s) {
    changes.push("dropped lot suffix");
    s = lot;
  }

  if (s.includes("/")) {
    s = s.split("/")[0].trim();
    changes.push("double address: kept the first");
  }

  const amp = s.replace(/^(\d+[A-Z]?)\s*&\s*\d+[A-Z]?\s+/, "$1 ");
  if (amp !== s) {
    changes.push("double address: kept the first");
    s = amp;
  }

  // Ranges: "322-322.5 WESTERN AVE", "14.5-16 VANDINE ST", "38-38- SOMME ST" → first whole number.
  const range = s.replace(/^(\d+)(?:\.\d+)?[A-Z]?\s*-\s*[\d.]*[A-Z]?-?\s+/, "$1 ");
  if (range !== s) {
    changes.push("house-number range: kept the first");
    s = range;
  }

  const ordinal = s.replace(/\b0+(\d+(?:ST|ND|RD|TH))\b/g, "$1");
  if (ordinal !== s) {
    changes.push("leading zero in ordinal");
    s = ordinal;
  }

  const words = s.split(" ");
  const last = words[words.length - 1];
  if (SUFFIX[last] && (last === "AV" || last === "BLV")) {
    words[words.length - 1] = SUFFIX[last];
    s = words.join(" ");
    changes.push("street suffix spelled out");
  }

  if (!/^\d+[A-Z]?\s+\S/.test(s)) {
    return { street: null, changes: [...changes, "no house number"] };
  }
  return { street: s, changes };
}

/** Comparable form of a street line: normalised, suffixes and directions abbreviated. */
export function streetKey(raw: string): string {
  const n = normaliseStreet(raw).street ?? raw.toUpperCase();
  return n
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w : SUFFIX[w] ?? DIRECTION[w] ?? w))
    .join(" ");
}

/** Lower-case, no punctuation, single spaces: for comparing place names. */
export function plain(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
