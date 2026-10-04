"use client";

import { useState, type ReactNode } from "react";
import EmailPreview, { type EmailView } from "./email-preview";
import { SIMULATED } from "./alert-form";

type Preview = EmailView & { sample: boolean };

/** "See an example alert": the change-alert email for this address from the one template, simulated. */
export default function ExampleAlert({ addressId, icon }: { addressId: string; icon: (id: string) => ReactNode }) {
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState(false);
  async function open() {
    setErr(false);
    try {
      const r = await fetch(`/api/alerts/preview?address=${encodeURIComponent(addressId)}`);
      if (!r.ok) throw new Error(String(r.status));
      setP((await r.json()) as Preview);
    } catch {
      setErr(true);
    }
  }
  return (
    <>
      <button type="button" className="linkbtn" onClick={open}>
        {icon("i-eye")}
        See an example alert
      </button>
      {err && (
        <span className="al-err" role="alert">
          {" "}
          The example did not load. Please try again.
        </span>
      )}
      <EmailPreview
        email={p}
        title={p?.sample ? "Example alert (sample change)" : "Example alert for this address"}
        note={SIMULATED}
        onClose={() => setP(null)}
      />
    </>
  );
}
