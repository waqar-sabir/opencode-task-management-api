import type { ReactNode } from "react";

export type IconName =
  | "check"
  | "circle"
  | "edit"
  | "trash"
  | "plus"
  | "search"
  | "chevron-left"
  | "chevron-right"
  | "refresh"
  | "close"
  | "alert"
  | "sort"
  | "inbox"
  | "wifi"
  | "wifi-off"
  | "trend"
  | "clipboard";

const ICONS: Record<IconName, ReactNode> = {
  check: <path d="m5 12.5 4.2 4.2L19 6.8" />,
  circle: <circle cx="12" cy="12" r="8.5" />,
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
      <path d="m6 7 .8 12.2a1.8 1.8 0 0 0 1.8 1.8h6.8a1.8 1.8 0 0 0 1.8-1.8L18 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6.4" />
      <path d="M20 5v6h-6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 3.5 21 20H3L12 3.5Z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  sort: (
    <path d="M8 5v14m0 0-3.5-3.5M8 19l3.5-3.5M16 19V5m0 0-3.5 3.5M16 5l3.5 3.5" />
  ),
  trend: (
    <>
      <path d="M4 19V5" />
      <path d="m4 15 5-5 4 3 7-7" />
      <path d="M15 6h5v5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 14h4l1.5 2h5L16 14h4" />
    </>
  ),
  wifi: (
    <>
      <path d="M3.5 9a13 13 0 0 1 17 0" />
      <path d="M6.5 12.5a8.5 8.5 0 0 1 11 0" />
      <path d="M9.5 16a4 4 0 0 1 5 0" />
      <path d="M12 19.5v.1" />
    </>
  ),
  "wifi-off": (
    <>
      <path d="M3.5 9a13 13 0 0 1 5.2-2.8" />
      <path d="M15 6.4A13 13 0 0 1 20.5 9" />
      <path d="M6.5 12.5a8.5 8.5 0 0 1 3-1.7" />
      <path d="M15 11.2a8.5 8.5 0 0 1 2.5 1.3" />
      <path d="M9.5 16a4 4 0 0 1 5 0" />
      <path d="m4 4 16 16" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3.5" rx="1" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={size}
    >
      {ICONS[name]}
    </svg>
  );
}
