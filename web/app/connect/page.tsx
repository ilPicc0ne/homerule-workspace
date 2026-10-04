import type { Metadata } from "next";
import ConnectTabs, { CopyField } from "./connect-tabs";
import s from "./connect.module.css";

/*
  /connect: how to add HomeRule's MCP server (/api/mcp) to Claude, ChatGPT or a coding tool.
  Static page; tabs and copy buttons are the only client code (connect-tabs.tsx).
*/

export const metadata: Metadata = {
  title: "Connect your chatbot",
  description: "Add HomeRule to Claude, ChatGPT or your editor: dated, quoted renter-protection law for 3 states and 10 cities.",
};

const MCP_URL = "https://yourhomerule.com/api/mcp";
const EXAMPLE =
  "Use HomeRule: what renter protections apply at 471 Columbia Rd, Dorchester, MA? Quote the law with its date, and tell me what's unknown.";

export default function ConnectPage() {
  return (
    <main className={`wrap ${s.page}`}>
      <div className={s.head}>
        <p className={s.kicker}>For Claude, ChatGPT and coding tools</p>
        <h1>Make your chatbot rent-law aware</h1>
        <p className={s.sub}>
          Add HomeRule as a connector. Your chatbot can then look up an address and answer with the law&rsquo;s own words, its date and a
          link, for 3 states and 10 cities.
        </p>
      </div>

      <section aria-labelledby="url-title" className={s.card}>
        <h2 id="url-title" className={s.label}>
          Connector URL
        </h2>
        <CopyField value={MCP_URL} big label="Copy URL" />
        <p className={s.hint}>No sign-in, no key. Read-only: it can look things up, never change anything.</p>
      </section>

      <ConnectTabs url={MCP_URL} />

      <section aria-labelledby="try-title" className={s.card}>
        <h2 id="try-title" className={s.label}>
          Try this first
        </h2>
        <CopyField value={EXAMPLE} label="Copy prompt" multiline />
      </section>

      <p className={s.disclaimer}>
        <strong>Your chatbot words the answer; HomeRule supplies the dated, quoted law. Not legal advice.</strong> Check the linked
        source before you act, and ask a tenant office or lawyer about your case.
      </p>
    </main>
  );
}
