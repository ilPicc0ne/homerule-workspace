const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" → "Oct 1, 2026"; "2026-01" → "Jan 2026"; "2026" → "2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1];
  if (!d) return `${month} ${y}`;
  return `${month} ${Number(d)}, ${y}`;
}

/** Retrieval stamps look like "2026-10-01T22:35Z". */
export function formatRetrieved(stamp: string | null | undefined): string {
  if (!stamp) return "";
  return formatDate(stamp.slice(0, 10));
}

export function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function confidenceWord(n: number): "High" | "Medium" | "Low" {
  if (n >= 0.85) return "High";
  if (n >= 0.65) return "Medium";
  return "Low";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Year from a built range; null when unknown. */
export function builtYear(built: { from: string } | null): string | null {
  return built ? built.from.slice(0, 4) : null;
}

export function unitsText(units: { min: number; max: number | null } | null): string | null {
  if (!units) return null;
  if (units.max === null) return `${units.min} or more`;
  if (units.min === units.max) return String(units.min);
  return `${units.min} to ${units.max}`;
}
