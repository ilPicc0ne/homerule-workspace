// The daily digest: one email per subscriber per day across all their addresses and events. Same layout, footer and
// unsubscribe links as the single-source alert (lib/changes/email.ts); one plain sentence per event (the address
// page's plain line), a button to each address page. Status words only, no advice.
import { esc } from "./html.ts";
import { footerHtml, footerText } from "./disclaimer.ts";
import { button, C, layout, link } from "./layout.ts";
import type { Message } from "./mail.ts";
import { daysBetween, type LifeData, type LifeEvent } from "./lifecycle.ts";
import { FROM, shortAddress, unsubscribeHeaders, unsubscribeUrl } from "../changes/email.ts";
import { longDate } from "../changes/wording.ts";
import { formatDate } from "../format.ts";
import { PLAIN, TOPICS } from "../plain.ts";

/** #72's badge texts, with the owner's plus/minus. Shown only when the diff carries a better/worse verdict. */
export const VERDICT_BADGE = {
  better: { sign: "+", text: "This change adds renter protection", color: "#1F6B4A", bg: "#E6F2EC" },
  worse: { sign: "−", text: "This change narrows renter protection", color: "#9A4A2E", bg: "#F7EAE3" },
} as const;

export const DEMO_LABEL = "Demo: fictional ordinance";

export type ItemText = { lead: string; topic: string; sentence: string; badge: string | null };

const MAY = " It may apply here: a building fact we don't have decides.";
const CONFLICT = " It may conflict with another rule on the same topic here; we don't decide that.";

/** One event in words: a short lead ("In 30 days"), the topic, one plain sentence. */
export function eventText(ev: LifeEvent, d: LifeData, today: string): ItemText {
  const rule = d.rules.get(ev.rule_id);
  const change = (d.changes.addresses[ev.address_id]?.entries ?? []).flatMap((e) => e.changes).find((c) => c.team_rule_id === ev.rule_id);
  const topic = TOPICS.find((t) => t.cat === (rule?.category ?? change?.category))?.title ?? "Housing rules";
  let plain = (PLAIN[ev.rule_id]?.line ?? rule?.summary ?? change?.title ?? rule?.title ?? "A housing rule for this address.").trim();
  if (!/[.!?]$/.test(plain)) plain += ".";
  const name = rule?.title ?? change?.title ?? ev.rule_id;
  const dated = ev.precision === "day" && ev.anchor !== "undated" ? formatDate(ev.anchor) : "";
  const withDate = dated && !plain.includes(dated) ? `From ${longDate(ev.anchor)}: ${plain}` : plain;
  const may = (ev.result === "unknown" ? MAY : "") + (ev.conflict && ev.trigger !== "ended" && ev.trigger !== "ending_30d" ? CONFLICT : "");
  const badge = ev.verdict ? `${VERDICT_BADGE[ev.verdict].sign} ${VERDICT_BADGE[ev.verdict].text}` : null;
  switch (ev.trigger) {
    case "discovered": {
      const future = ev.anchor !== "undated" && ev.anchor > today;
      const tail = ev.anchor === "undated" ? "" : future ? ` It takes effect ${ev.when}.` : " It is in effect.";
      return { lead: "New law", topic, sentence: `${plain}${tail}${may}`, badge };
    }
    case "upcoming_30d": {
      // relative to the day the mail goes out: a retry the next day says "In 29 days", never a wrong "30"
      const n = daysBetween(today, ev.anchor);
      if (ev.precision === "day") return { lead: n === 1 ? "Tomorrow" : `In ${n} days`, topic, sentence: `${withDate}${may}`, badge };
      if (ev.precision === "disputed") return { lead: "Coming soon", topic, sentence: `Takes effect ${ev.when}: ${plain}${may}`, badge };
      return { lead: `Coming ${ev.when}`, topic, sentence: `Takes effect ${ev.when} (the law gives no exact day): ${plain}${may}`, badge };
    }
    case "in_force":
      if (today !== ev.anchor) return { lead: "Now in effect", topic, sentence: `In effect since ${longDate(ev.anchor)}: ${plain}${may}`, badge };
      return { lead: "Now in effect", topic, sentence: `${dated && plain.includes(dated) ? "Takes effect today" : `Takes effect today, ${longDate(ev.anchor)}`}: ${plain}${may}`, badge };
    case "ending_30d": {
      const n = daysBetween(today, ev.anchor);
      return { lead: n === 1 ? "Ends tomorrow" : `Ends in ${n} days`, topic, sentence: `On ${longDate(ev.anchor)} this rule stops applying at this address: ${plain}`, badge };
    }
    case "ended":
      return {
        lead: "Ended",
        topic,
        sentence: `${today === ev.anchor ? `From today, ${longDate(ev.anchor)},` : `Since ${longDate(ev.anchor)}`} this rule no longer applies at this address: ${plain}`,
        badge,
      };
    case "correction": {
      const k = ev.correction!;
      const verb = k.kind === "start" ? "takes effect" : "ends";
      const was = k.was ? ` ${verb} on ${longDate(k.was)}` : "";
      const sentence = k.withdrawn
        ? `We wrote to you about "${name}". Our data no longer shows this rule for this address.`
        : k.pending
          ? `We wrote that "${name}"${was}. Our data now lists it as a proposed bill, not law.`
          : k.now
            ? `We wrote that "${name}"${was}. The date in our data is now ${longDate(k.now)}.`
            : `We wrote that "${name}"${was}. Our data no longer gives an end date.`;
      return { lead: "Correction", topic, sentence, badge: null };
    }
  }
}

export type DigestGroup = {
  address_id: string;
  label: string;
  /** This subscription's unsubscribe token. */
  token: string;
  items: { ev: LifeEvent; text: ItemText }[];
};

export type DigestInput = { to: string; groups: DigestGroup[]; site: string; dataAsOf: string };

export function renderDigest(o: DigestInput): Message {
  const site = o.site.replace(/\/$/, "");
  const first = o.groups[0];
  const short = shortAddress(first.label);
  const more = o.groups.length > 1 ? ` and ${o.groups.length - 1} other address${o.groups.length > 2 ? "es" : ""}` : "";
  const all = o.groups.flatMap((g) => g.items);
  const demo = all.some((i) => i.ev.demo);
  const correction = all.some((i) => i.ev.trigger === "correction");
  const subject = `${demo ? `[${DEMO_LABEL}] ` : ""}${correction ? "Correction and rule updates" : "Rule updates"} for ${short}${more}`;
  const banner = demo ? `${DEMO_LABEL}: built from a fictional test document, not real law.` : null;
  const greeting = o.groups.length > 1 ? "Hi, here is what changes for the addresses you follow:" : `Hi, here is what changes for ${short}:`;
  const asOf = longDate(o.dataAsOf);
  const line = (t: ItemText) => `${t.lead} · ${t.topic}${t.badge ? ` · ${t.badge}` : ""} — ${t.sentence}`;
  const page = (g: DigestGroup) => `${site}/a/${encodeURIComponent(g.address_id)}`;
  const cta = (g: DigestGroup) => `See what this means for ${shortAddress(g.label)}`;

  const text = [
    ...(banner ? [banner.toUpperCase(), ""] : []),
    greeting,
    "",
    ...o.groups.flatMap((g) => [g.label, ...g.items.map((i) => `• ${line(i.text)}`), `${cta(g)}: ${page(g)}`, ""]),
    `You get this because you asked for alerts on ${o.groups.map((g) => g.label).join("; ")}.`,
    ...o.groups.map((g) => `Unsubscribe from ${shortAddress(g.label)}: ${unsubscribeUrl(site, g.address_id, g.token)}`),
    `HomeRule · Not legal advice · data as of ${asOf}`,
    ...footerText(),
  ].join("\n");

  const badge = (t: ItemText, ev: LifeEvent) => {
    if (!t.badge || !ev.verdict) return "";
    const b = VERDICT_BADGE[ev.verdict];
    return `<span style="display:inline-block;margin:0 0 6px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:${b.color};background:${b.bg}">${esc(t.badge)}</span><br>`;
  };
  const rows = o.groups
    .map(
      (g) => `<tr><td class="tx" style="padding:18px 0 4px;font-size:15px;font-weight:700;color:${C.text}">${esc(g.label)}</td></tr>
${g.items
  .map(
    (i) =>
      `<tr><td class="tx ln" style="padding:12px 0;border-top:1px solid ${C.line};font-size:16px;line-height:1.5;color:${C.text}">${badge(i.text, i.ev)}<strong>${esc(i.text.lead)}</strong> &middot; ${esc(i.text.topic)} &mdash; ${esc(i.text.sentence)}</td></tr>`,
  )
  .join("\n")}
<tr><td style="padding:14px 0 10px">${button(page(g), cta(g))}</td></tr>`,
    )
    .join("\n");
  const unsubs = o.groups.map((g) => link(unsubscribeUrl(site, g.address_id, g.token), `Unsubscribe from ${shortAddress(g.label)}`, C.faint)).join(" &middot; ");
  const html = layout({
    title: subject,
    preheader: `${all[0].text.lead}: ${all[0].text.sentence}`,
    banner,
    site,
    rows: `<tr><td class="tx" style="padding:16px 0 0;font-size:16px;line-height:1.5;color:${C.text}">${esc(greeting)}</td></tr>\n${rows}`,
    footer: `You get this because you asked for alerts on ${esc(o.groups.map((g) => g.label).join("; "))}. ${unsubs}.<br>Not legal advice &middot; data as of ${esc(asOf)}<br>${footerHtml()}`,
  });
  // The header can name one subscription only: the first address's (the body links cover the others).
  return { from: FROM, to: o.to, subject, html, text, headers: unsubscribeHeaders(site, first.address_id, first.token) };
}
