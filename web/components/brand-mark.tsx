/*
  The HomeRule brand mark, concept 9 "Roof scales" (lab/ui-proposal/icons/icon-9.svg): the roof is the beam of a
  pair of scales. Drawn in currentColor without its tile; the surrounding .brand-mark / .logo-mark supplies the navy
  tile, so header sizes and alignment stay as they were. Favicon and apple-icon live in app/ (icon.svg, favicon.ico,
  apple-icon.png); the email header uses public/email-mark.png.
*/
export default function BrandMark() {
  return (
    <svg
      className="brand-svg"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 12.8 16 6.4l9.5 6.4" strokeWidth="2.6" />
      <path d="M16 6.4v17.6M11 25h10" strokeWidth="2.6" />
      <path d="M6.5 12.8v4.6M25.5 12.8v4.6" strokeWidth="1.4" />
      <path d="M3.6 17.6h5.8a2.9 2.9 0 0 1-5.8 0Z" fill="currentColor" strokeWidth="1" />
      <path d="M22.6 17.6h5.8a2.9 2.9 0 0 1-5.8 0Z" fill="currentColor" strokeWidth="1" />
    </svg>
  );
}
