/**
 * Icon set.
 *
 * Inline SVG rather than an icon font or a runtime dependency: these render
 * inside server-rendered HTML with no extra request, no flash of missing glyph,
 * and no 100KB package for the nine shapes this site actually uses.
 *
 * House rules, so a later addition does not look foreign:
 *
 *   - 24×24 viewBox, geometry drawn on that grid
 *   - stroke, never fill, at 1.75 — thin enough to read as modern, heavy
 *     enough to survive at 20px
 *   - round caps and joins
 *   - `currentColor`, so colour is decided by the surrounding class
 *   - `aria-hidden`, because every icon here sits beside its own visible label.
 *     An icon that ever stands alone needs a real accessible name instead.
 */

import type { Child, FC } from "hono/jsx";

export type IconName =
  | "users"
  | "send"
  | "zap"
  | "qr"
  | "calendar"
  | "chart"
  | "shield"
  | "whatsapp"
  | "spark";

const PATHS: Record<IconName, Child> = {
  /** Lost customers — a group, with one figure set apart. */
  users: (
    <>
      <path d="M15.5 19.5V18a3.5 3.5 0 0 0-3.5-3.5H6A3.5 3.5 0 0 0 2.5 18v1.5" />
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M18 8.5h4" />
      <path d="M20 6.5v4" />
    </>
  ),

  /** Win-back campaigns — a sent message. */
  send: (
    <>
      <path d="M21.5 2.5 10.5 13.5" />
      <path d="M21.5 2.5 14.75 21.5l-3.75-7.5-7.5-3.75Z" />
    </>
  ),

  /** Speed at the reception desk. */
  zap: <path d="M13.5 2 4.5 13.5h6l-1 8.5 9-11.5h-6l1-8.5Z" />,

  /** The customer wallet, reached by a QR code at the desk. */
  qr: (
    <>
      <rect x="2.75" y="2.75" width="7" height="7" rx="1.5" />
      <rect x="14.25" y="2.75" width="7" height="7" rx="1.5" />
      <rect x="2.75" y="14.25" width="7" height="7" rx="1.5" />
      <path d="M14.25 14.25h3v3h-3z" />
      <path d="M21.25 14.25v3M14.25 21.25h3M21.25 21.25h.01" />
    </>
  ),

  /** Per-customer visit cadence: a calendar that keeps time. */
  calendar: (
    <>
      <path d="M21 11V6.5A1.5 1.5 0 0 0 19.5 5h-15A1.5 1.5 0 0 0 3 6.5v13A1.5 1.5 0 0 0 4.5 21H11" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <circle cx="17.5" cy="17.5" r="4.25" />
      <path d="M17.5 15.75v1.9l1.25.85" />
    </>
  ),

  /** Reports. */
  chart: (
    <>
      <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" />
      <path d="M7.5 16.5v-3.75" />
      <path d="M12.75 16.5V8.25" />
      <path d="M18 16.5v-6" />
    </>
  ),

  /** Tenant isolation and data ownership. */
  shield: (
    <>
      <path d="M12 2.75 4.5 6v6c0 4.4 3.1 7.9 7.5 9.25 4.4-1.35 7.5-4.85 7.5-9.25V6Z" />
      <path d="m9 12 2.25 2.25L15.5 10" />
    </>
  ),

  /** Messaging from the salon's own number. */
  whatsapp: (
    <>
      <path d="M3.5 20.5l1.3-4.1a8.2 8.2 0 1 1 3.1 3Z" />
      <path d="M9 9.2c.2 1 .7 1.9 1.4 2.6.7.7 1.6 1.2 2.6 1.4l.9-1.1 1.8.8-.3 1.5c-1.9.3-3.8-.4-5.2-1.8S8.1 11 8.4 9.1l1.5-.3Z" />
    </>
  ),

  /** The product's one idea: revenue that comes back. */
  spark: (
    <>
      <path d="M12 2.5 13.9 8l5.6 1.9-5.6 1.9L12 17.5l-1.9-5.7L4.5 9.9 10.1 8Z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
    </>
  )
};

/**
 * One icon, sized by the caller through `class` (default 24px via the SVG's own
 * width/height). Pass `size-5`, `size-6` and so on rather than editing this.
 */
export const Icon: FC<{ name: IconName; class?: string }> = ({ name, class: className }) => (
  <svg
    class={className ?? "size-6"}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {PATHS[name]}
  </svg>
);
