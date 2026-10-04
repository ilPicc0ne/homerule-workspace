export const SOURCE_NAMES: Record<string, string> = { la: "LA County assessor", ma: "MassGIS parcels", sf: "SF assessor", sd: "San Diego permits", sdparcels: "San Diego County parcels", hud: "HUD multifamily housing", lihtc: "HUD tax-credit housing", nj: "NJ MOD-IV parcels" };
export const FACT_NAMES: Record<string, string> = { built: "Construction year", units: "Unit count", subsidised: "Housing-program restriction", owner_occupied: "Owner-occupancy lead", owner_type: "Owner type", use_class: "Building use", occupancy_record: "Administrative occupancy record", program_participation: "Housing-program record", permit_event: "Permit record" };
export function safeEvidenceUrl(value: string | null | undefined): string | null {
  try { const u = new URL(value ?? ""); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}
export function evidenceValue(v: unknown): string {
  if (v === null || v === undefined) return "Not recorded";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v !== "object") return String(v);
  const o = v as Record<string, unknown>;
  if ("from" in o && "to" in o) {
    const a = String(o.from), b = String(o.to);
    return a.endsWith("-01-01") && b.endsWith("-12-31") && a.slice(0,4) === b.slice(0,4) ? a.slice(0,4) : `${a} to ${b}`;
  }
  if ("min" in o && "max" in o) return o.min === o.max ? String(o.min) : o.max == null ? `${o.min}+` : `${o.min}–${o.max}`;
  if ("date" in o) return String(o.date);
  return Object.entries(o).map(([k,x]) => `${k.replaceAll("_", " ")}: ${String(x)}`).join("; ");
}
