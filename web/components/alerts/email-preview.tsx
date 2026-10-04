"use client";

import { useEffect, useRef } from "react";
import "./alerts.css";

export type EmailView = { from: string; to: string; subject: string; html: string };

/**
 * The email overlay: one email exactly as the template renders it, in a sandboxed frame (no scripts).
 * `note` is the label on top ("Preview — simulated, nothing is sent").
 */
export default function EmailPreview({ email, note, title, onClose }: { email: EmailView | null; note: string; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (email && !d.open) d.showModal();
    if (!email && d.open) d.close();
  }, [email]);
  return (
    <dialog ref={ref} className="em-dlg" aria-labelledby="em-dlg-t" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {email && (
        <div className="em-box">
          <div className="em-top">
            <h2 id="em-dlg-t" className="em-t">
              {title}
            </h2>
            <button type="button" className="em-x" onClick={onClose} aria-label="Close preview">
              ×
            </button>
          </div>
          <p className="em-note" role="note">
            {note}
          </p>
          <dl className="em-meta">
            <div>
              <dt>From</dt>
              <dd>{email.from}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{email.to}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{email.subject}</dd>
            </div>
          </dl>
          <iframe className="em-frame" title={`Email: ${email.subject}`} srcDoc={email.html} sandbox="allow-popups allow-popups-to-escape-sandbox" />
        </div>
      )}
    </dialog>
  );
}
