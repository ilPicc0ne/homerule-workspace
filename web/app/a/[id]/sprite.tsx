/* Icon sprite from mockup v3 (lab/ui-proposal/v3/index.html); use with <Ic id="i-rent" />. */
const SYMBOLS = `
<symbol id="i-rent" viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M12 17.5v-6"/><path d="m9.5 14 2.5-2.5 2.5 2.5"/></symbol>
<symbol id="i-door" viewBox="0 0 24 24"><path d="M13 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H13"/><path d="M10 12h10"/><path d="m16.5 8.5 3.5 3.5-3.5 3.5"/></symbol>
<symbol id="i-chip" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M10 10h4v4h-4z"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/></symbol>
<symbol id="i-safe" viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="14.5" rx="2.5"/><circle cx="12" cy="11.25" r="3.5"/><path d="M12 7.75v1.1M12 13.65v1.1M8.5 11.25h1.1M14.4 11.25h1.1"/><path d="M7 18.5v2M17 18.5v2"/></symbol>
<symbol id="i-receipt" viewBox="0 0 24 24"><path d="M6 3.5h12V21l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/></symbol>
<symbol id="i-id" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.8" r="2.2"/><path d="M5.8 16.2c.7-1.6 1.8-2.4 3.2-2.4s2.5.8 3.2 2.4"/><path d="M14.5 10h3.5M14.5 13.5h3.5"/></symbol>
<symbol id="g-check" viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></symbol>
<symbol id="g-q" viewBox="0 0 24 24"><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.3-2.8 4.3"/><path d="M12 18.6v.01"/></symbol>
<symbol id="g-dot" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6" fill="currentColor"/></symbol>
<symbol id="i-cal" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="i-flag" viewBox="0 0 24 24"><path d="M5.5 21V4"/><path d="M5.5 4.5h11.5l-2.5 4 2.5 4H5.5"/></symbol>
<symbol id="i-dash" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-dasharray="3.1 2.6"/></symbol>
<symbol id="i-turn" viewBox="0 0 24 24"><path d="M5 4.5v6a4 4 0 0 0 4 4h10"/><path d="m15 10.5 4 4-4 4"/></symbol>
<symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 9.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15.5 6 9.5"/><path d="M10 20.5a2.3 2.3 0 0 0 4 0"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></symbol>
<symbol id="i-quote" viewBox="0 0 24 24"><path d="M5 17.5c2.6-.8 4-2.9 4-6.2V7H5v4.3h4"/><path d="M14.5 17.5c2.6-.8 4-2.9 4-6.2V7h-4v4.3h4"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.9v.01"/></symbol>
<symbol id="i-building" viewBox="0 0 24 24"><path d="M4.5 20.5V5A1.5 1.5 0 0 1 6 3.5h7A1.5 1.5 0 0 1 14.5 5v15.5"/><path d="M14.5 9.5H18a1.5 1.5 0 0 1 1.5 1.5v9.5"/><path d="M3 20.5h18M8 7.5h3M8 11h3M8 14.5h3"/></symbol>
<symbol id="i-capitol" viewBox="0 0 24 24"><path d="M3 20.5h18"/><path d="M4.5 9.5h15"/><path d="M12 3.5 20 8H4z"/><path d="M6.5 9.5v8M10 9.5v8M14 9.5v8M17.5 9.5v8"/></symbol>
<symbol id="i-units" viewBox="0 0 24 24"><path d="M5 20.5V4.5h14v16"/><path d="M3 20.5h18M8.5 8h2M13.5 8h2M8.5 11.5h2M13.5 11.5h2M10.5 20.5v-4h3v4"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4.5-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/></symbol>
<symbol id="i-list" viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.5 1.2 1.2 2-2.2M3.5 12l1.2 1.2 2-2.2M3.5 17.5l1.2 1.2 2-2.2"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
`;

export function Sprite() {
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SYMBOLS }} />;
}

export function Ic({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg className={`icon ${className}`} aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}
