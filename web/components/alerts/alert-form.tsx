"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import EmailPreview, { type EmailView } from "./email-preview";
import "./alerts.css";

type Status = "sent" | "closed_test" | "not_configured" | "already" | "failed" | "invalid" | "unavailable";
type Result = { status: Status; preview?: EmailView; error?: string };

export const SIMULATED = "Preview — simulated, nothing is sent";

const SAY: Record<Status, string> = {
  sent: "Check your email. Tap the link in it to turn alerts on.",
  closed_test: "Alerts are in a closed test right now — we saved your request.",
  not_configured: "Email is not set up yet — we saved your request.",
  already: "Alerts are already on for this email and address.",
  failed: "We could not send the email. We saved your request.",
  invalid: "Please enter a valid email.",
  unavailable: "Alerts are not working right now. Please try later.",
};

/**
 * The alert signup in the sticky bar: email + this address → POST /api/subscribe (double opt-in, closed test).
 * After a submit, "See the email" shows the confirmation email in the overlay.
 */
export default function AlertForm({
  addressId,
  street,
  open,
  onClose,
  icon,
}: {
  addressId: string;
  street: string;
  open: boolean;
  onClose: () => void;
  icon: (id: string) => ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, address_id: addressId }),
      });
      const j = (await r.json().catch(() => ({ status: "unavailable" }))) as Result;
      setRes(SAY[j.status] ? j : { status: "unavailable" });
    } catch {
      setRes({ status: "unavailable" });
    } finally {
      setBusy(false);
    }
  }

  const done = res && res.status !== "invalid" && res.status !== "unavailable";
  return (
    <>
      {open && (
        <form
          className={`alert${done ? " sent" : ""}`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        >
          <label className="fld-l" htmlFor="em">
            {icon("i-bell")}
            <span>Alerts for {street}</span>
          </label>
          <div className="al-row">
            <div className="fld">
              {icon("i-mail")}
              <input
                ref={ref}
                id="em"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (res) setRes(null);
                }}
                aria-describedby="al-more"
              />
            </div>
            <button type="submit" className="al-btn" disabled={busy}>
              {busy ? "Sending…" : "Email me"}
            </button>
          </div>
          {res &&
            (done ? (
              <p className="al-status" role="status">
                {icon("i-clock")}
                {SAY[res.status]}
              </p>
            ) : (
              <p className="al-err" role="alert">
                {SAY[res.status]}
              </p>
            ))}
          {res?.preview && (
            <p className="al-more">
              <button type="button" className="linkbtn" onClick={() => setShow(true)}>
                {icon("i-eye")}
                See the email
              </button>
            </p>
          )}
          <p className="al-more" id="al-more">
            One email per rule change for this address. We ask you to confirm first. Not legal advice.
          </p>
        </form>
      )}
      <EmailPreview
        email={show ? (res?.preview ?? null) : null}
        title="The confirmation email"
        note={res?.status === "sent" ? "This is a copy of the email we sent. The link here is turned off." : SIMULATED}
        onClose={() => setShow(false)}
      />
    </>
  );
}
