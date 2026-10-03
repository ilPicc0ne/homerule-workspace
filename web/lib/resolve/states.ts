// US states and DC with USPS abbreviation and Census FIPS code. Used to read the state out of typed
// input and to show a "not covered" tree for places outside CA, NJ and MA.

export type StateInfo = { abbr: string; name: string; fips: string };

export const STATES: StateInfo[] = [
  ["AL", "Alabama", "01"], ["AK", "Alaska", "02"], ["AZ", "Arizona", "04"], ["AR", "Arkansas", "05"],
  ["CA", "California", "06"], ["CO", "Colorado", "08"], ["CT", "Connecticut", "09"], ["DE", "Delaware", "10"],
  ["DC", "District of Columbia", "11"], ["FL", "Florida", "12"], ["GA", "Georgia", "13"], ["HI", "Hawaii", "15"],
  ["ID", "Idaho", "16"], ["IL", "Illinois", "17"], ["IN", "Indiana", "18"], ["IA", "Iowa", "19"],
  ["KS", "Kansas", "20"], ["KY", "Kentucky", "21"], ["LA", "Louisiana", "22"], ["ME", "Maine", "23"],
  ["MD", "Maryland", "24"], ["MA", "Massachusetts", "25"], ["MI", "Michigan", "26"], ["MN", "Minnesota", "27"],
  ["MS", "Mississippi", "28"], ["MO", "Missouri", "29"], ["MT", "Montana", "30"], ["NE", "Nebraska", "31"],
  ["NV", "Nevada", "32"], ["NH", "New Hampshire", "33"], ["NJ", "New Jersey", "34"], ["NM", "New Mexico", "35"],
  ["NY", "New York", "36"], ["NC", "North Carolina", "37"], ["ND", "North Dakota", "38"], ["OH", "Ohio", "39"],
  ["OK", "Oklahoma", "40"], ["OR", "Oregon", "41"], ["PA", "Pennsylvania", "42"], ["RI", "Rhode Island", "44"],
  ["SC", "South Carolina", "45"], ["SD", "South Dakota", "46"], ["TN", "Tennessee", "47"], ["TX", "Texas", "48"],
  ["UT", "Utah", "49"], ["VT", "Vermont", "50"], ["VA", "Virginia", "51"], ["WA", "Washington", "53"],
  ["WV", "West Virginia", "54"], ["WI", "Wisconsin", "55"], ["WY", "Wyoming", "56"], ["PR", "Puerto Rico", "72"],
].map(([abbr, name, fips]) => ({ abbr, name, fips }));

export const stateByAbbr = new Map(STATES.map((s) => [s.abbr, s]));
export const stateByFips = new Map(STATES.map((s) => [s.fips, s]));
export const stateByName = new Map(STATES.map((s) => [s.name.toLowerCase(), s]));

/** Three-digit ZIP prefixes of the states in scope (USPS). Other ZIPs are outside HomeRule's states. */
const ZIP3: [number, number, string][] = [
  [900, 961, "CA"],
  [70, 89, "NJ"],
  [10, 27, "MA"],
  [55, 55, "MA"],
];

export function stateForZip(zip: string): StateInfo | null {
  const p = Number(zip.slice(0, 3));
  const hit = ZIP3.find(([lo, hi]) => p >= lo && p <= hi);
  return hit ? stateByAbbr.get(hit[2])! : null;
}
