// The prototype notice: one text for the site banner and every email footer.
import { esc } from "./html.ts";

export const PROTOTYPE_NOTICE =
  "Prototype built at a hackathon — not production-ready. Results may be wrong or out of date. Not legal advice.";

/** The privacy line in the signup box and the confirmation email. */
export const PRIVACY = "We store your email and this address only, to send these alerts. Unsubscribe in one click.";

/**
 * PLACEHOLDER — the sender's physical postal address (CAN-SPAM). The owner must replace this
 * before any mail goes to people outside the test list. Do not invent one.
 */
export const POSTAL_ADDRESS = "[PLACEHOLDER: HomeRule postal address — owner to fill in]";

export function footerText(): string[] {
  return [PROTOTYPE_NOTICE, `HomeRule · ${POSTAL_ADDRESS}`];
}

export function footerHtml(): string {
  return `${esc(PROTOTYPE_NOTICE)}<br>HomeRule &middot; ${esc(POSTAL_ADDRESS)}`;
}
