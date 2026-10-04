// The example alert on the address page: the real change for this address if there is one, else a real change at a
// sample address, clearly labelled. Rendered by the one alert template (lib/changes/email.ts).
import { addressChange, render } from "../changes/email.ts";
import type { ChangesFile } from "../changes/types.ts";
import { PREVIEW_TOKEN } from "./service.ts";

/** The address whose change stands in when an address has none (Hoboken FAIR Act, J3). */
export const SAMPLE_ADDRESS = "A0256";

export type AlertPreview = { from: string; to: string; subject: string; html: string; sample: boolean };

export function alertPreview(file: ChangesFile, addressId: string, site: string): AlertPreview | null {
  const own = addressChange(file, addressId);
  const ac = own ?? addressChange(file, SAMPLE_ADDRESS) ?? Object.keys(file.addresses).map((id) => addressChange(file, id)).find(Boolean) ?? null;
  if (!ac) return null;
  const banner = own
    ? undefined
    : `Example only. No rule changed at your address in our data. This shows a real change at ${ac.label}, so you can see what an alert looks like.`;
  const m = render(ac, { site, token: PREVIEW_TOKEN, banner });
  return { from: m.from, to: "you@example.com", subject: own ? m.subject : `[Example] ${m.subject}`, html: m.html, sample: !own };
}
