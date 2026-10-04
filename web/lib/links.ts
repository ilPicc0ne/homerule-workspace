/** Link target that keeps the chosen as-of date (omitted for the default date). */
export function withAsOf(href: string, asOf: string, fallback: string) {
  if (asOf === fallback) return href;
  return `${href}${href.includes("?") ? "&" : "?"}as_of=${asOf}`;
}
