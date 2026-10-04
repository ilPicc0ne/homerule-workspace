"use client";

import Link from "next/link";
import { useState } from "react";

/** "Ask your chatbot about this address": copies a ready prompt for a chatbot with the HomeRule connector (/connect). */
export default function AskChatbot({ place }: { place: string }) {
  const [done, setDone] = useState(false);
  const prompt = `Use HomeRule: what renter protections apply at ${place}? Quote the law with its date, and tell me what's unknown.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  };
  return (
    <p className="ask-bot">
      <button type="button" onClick={copy} aria-live="polite" style={{ font: "inherit", fontWeight: 700, color: "var(--teal-ink)", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
        {done ? "Prompt copied" : "Ask your chatbot about this address"}
      </button>{" "}
      (copies a ready prompt) · <Link href="/connect">Connect Claude or ChatGPT to HomeRule</Link>
    </p>
  );
}
