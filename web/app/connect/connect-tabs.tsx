"use client";

import { useState } from "react";
import s from "./connect.module.css";

export function CopyField({ value, label, big, multiline }: { value: string; label: string; big?: boolean; multiline?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className={`${s.copy} ${big ? s.big : ""} ${multiline ? s.multi : ""}`}>
      <code className={s.value}>{value}</code>
      <button type="button" className={s.copyBtn} onClick={copy} aria-live="polite">
        {done ? "Copied" : label}
      </button>
    </div>
  );
}

type Tab = "claude" | "chatgpt" | "dev";
const TABS: { id: Tab; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "dev", label: "Developers" },
];

function b64(s: string) {
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s).toString("base64");
}

export default function ConnectTabs({ url }: { url: string }) {
  const [tab, setTab] = useState<Tab>("claude");
  const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=homerule&config=${b64(JSON.stringify({ url }))}`;
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "homerule", type: "http", url }))}`;
  const json = JSON.stringify({ mcpServers: { homerule: { url } } }, null, 2);

  return (
    <section className={s.card} aria-label="How to connect">
      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={s.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "claude" && (
        <div role="tabpanel" id="panel-claude" aria-labelledby="tab-claude" className={s.panel}>
          <ol className={s.steps}>
            <li>
              In Claude (web or desktop), open <b>Customize → Connectors</b>.
            </li>
            <li>
              Click <b>+ Add</b>, then <b>Add custom connector</b>.
            </li>
            <li>Paste the URL above and click <b>Continue</b>.</li>
            <li>
              In a chat, turn HomeRule on from the tools menu, then ask your question.
            </li>
          </ol>
          <p className={s.hint}>The Free plan allows one custom connector.</p>
        </div>
      )}

      {tab === "chatgpt" && (
        <div role="tabpanel" id="panel-chatgpt" aria-labelledby="tab-chatgpt" className={s.panel}>
          <ol className={s.steps}>
            <li>Needs a paid ChatGPT plan. In Settings, turn on <b>Developer Mode</b>.</li>
            <li>
              Add a custom connector: name <b>HomeRule</b>, description <i>Dated, quoted US renter-protection law</i>, and the URL above.
            </li>
            <li>
              Tick <b>I trust this provider</b> and create it.
            </li>
            <li>
              In each chat, enable it via <b>+ → Developer Mode</b>.
            </li>
          </ol>
          <p className={s.hint}>ChatGPT changes these menus often; the path may differ.</p>
        </div>
      )}

      {tab === "dev" && (
        <div role="tabpanel" id="panel-dev" aria-labelledby="tab-dev" className={s.panel}>
          <p className={s.sublabel}>Claude Code</p>
          <CopyField value={`claude mcp add --transport http homerule ${url}`} label="Copy" />
          <p className={s.sublabel}>Cursor and VS Code</p>
          <div className={s.buttons}>
            <a className={s.install} href={cursor}>
              Add to Cursor
            </a>
            <a className={s.install} href={vscode}>
              Add to VS Code
            </a>
          </div>
          <p className={s.sublabel}>Any other MCP client (JSON config)</p>
          <CopyField value={json} label="Copy" multiline />
        </div>
      )}
    </section>
  );
}
