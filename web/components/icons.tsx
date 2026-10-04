import type { ReactNode } from "react";

/* Inline line icons, 24px grid, drawn for this page. Decorative: aria-hidden. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const icons = {
  home: (
    <Icon>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h13V9" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  ),
  pin: (
    <Icon>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  ),
  check: (
    <Icon>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  ),
  rent: (
    <Icon>
      <path d="m3.5 17 6-6 4 4 7-7" />
      <path d="M15 8h5.5v5.5" />
    </Icon>
  ),
  shield: (
    <Icon>
      <path d="M12 3.5 19.5 6v5.5c0 4.4-3.1 7.9-7.5 9-4.4-1.1-7.5-4.6-7.5-9V6L12 3.5Z" />
      <path d="m8.75 12 2.25 2.25 4.25-4.5" />
    </Icon>
  ),
  key: (
    <Icon>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m11 12.5 8.5-8.5" />
      <path d="m16.5 7 2.5 2.5" />
      <path d="m14 9.5 2 2" />
    </Icon>
  ),
  receipt: (
    <Icon>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" />
      <path d="M9 8.5h6" />
      <path d="M9 12.5h4" />
    </Icon>
  ),
  idcard: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.3 1.7-2 3-2s2.4.7 3 2" />
      <path d="M14.5 10h3.5" />
      <path d="M14.5 13.5h2.5" />
    </Icon>
  ),
  chip: (
    <Icon>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M10 10h4v4h-4z" />
      <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
    </Icon>
  ),
  quote: (
    <Icon>
      <path d="M4.5 12.5h5v5h-5zM4.5 12.5c0-3.2 1.6-5.3 5-6" />
      <path d="M14.5 12.5h5v5h-5zM14.5 12.5c0-3.2 1.6-5.3 5-6" />
    </Icon>
  ),
  calendar: (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 14.5h3" />
    </Icon>
  ),
  unsure: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
      <path d="M12 16.75h.01" />
    </Icon>
  ),
  dash: (
    <Icon>
      <path d="M7 12h10" />
    </Icon>
  ),
  mail: (
    <Icon>
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </Icon>
  ),
  bell: (
    <Icon>
      <path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2H5l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Icon>
  ),
  external: (
    <Icon>
      <path d="M13.5 5.5h5v5" />
      <path d="m18.5 5.5-8 8" />
      <path d="M17 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7H10.5" />
    </Icon>
  ),
};
