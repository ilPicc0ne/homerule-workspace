"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import EmailPreview, { type EmailView } from "./email-preview";
import { PRIVACY_STORE, PRIVACY_UNSUB } from "@/lib/alerts/disclaimer";
import "./alerts.css";

type Status = "sent" | "closed_test" | "not_configured" | "failed" | "invalid" | "rate_limited" | "unavailable";
type Result = { status: Status; preview?: EmailView; error?: string };

export const SIMULATED = "Preview — simulated, nothing is sent";

const SAY: Record<Status, string> = {
  sent: "Check your inbox. Tap the button in the email to turn alerts on (it works for 48 hours).",
  closed_test: "Alerts are in a closed test right now — we saved your request.",
  not_configured: "Email is not set up yet — we saved your request.",
  failed: "We could not send the email. We saved your request.",
  invalid: "Please enter a valid email.",
  rate_limited: "Too many tries. Please wait a few minutes.",
  unavailable: "Alerts are not working right now. Please try later.",
};

/**
 * The alert signup in the sticky bar: email + this address → POST /api/subscribe (double opt-in, closed test).
 * After a submit, "See the email" shows the confirmation email in the overlay.
 * A popover, not a modal: × and Escape close it and hand focus back to the trigger (`onClose(true)`);
 * a click outside closes it without moving focus (`onClose(false)`). Closing never submits; the typed
 * email stays for the next open.
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
  onClose: (refocus: boolean) => void;
  icon: (id: string) => ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  // Escape anywhere and a click outside the bar's alert area close it. While the email overlay is up,
  // the dialog owns Escape and its clicks sit inside the wrapper, so the form stays open behind it.
  useEffect(() => {
    if (!open || show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(true);
    };
    const onDown = (e: PointerEvent) => {
      const wrap = formRef.current?.parentElement;
      if (wrap && e.target instanceof Node && !wrap.contains(e.target)) onClose(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, show, onClose]);

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

  const done = res && res.status !== "invalid" && res.status !== "unavailable" && res.status !== "rate_limited";
  return (
    <>
      {open && (
        <form
          ref={formRef}
          className={`alert${done ? " sent" : ""}`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
        >
          <div className="al-top">
            <label className="fld-l" htmlFor="em">
              {icon("i-bell")}
              <span>Alerts for {street}</span>
            </label>
            <button type="button" className="clear al-x" aria-label="Close" onClick={() => onClose(true)}>
              {icon("i-x")}
            </button>
          </div>
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
          <div className="al-fine" id="al-more">
            <p className="al-lead">One email when a rule changes for this address.</p>
            <ul className="al-pts">
              <li>We ask you to confirm first.</li>
              <li>{PRIVACY_UNSUB}</li>
              <li>{PRIVACY_STORE}</li>
            </ul>
            <p className="al-nla">Not legal advice.</p>
          </div>
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
