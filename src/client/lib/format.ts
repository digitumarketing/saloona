/**
 * Display formatting.
 *
 * All of these are deliberately locale-explicit. The Workers runtime ships
 * limited ICU data and `en-PK` currency formatting is not reliably available, so
 * money is grouped by hand — the same approach as the server's `formatPkr`, kept
 * in step so a figure never renders differently in an email and on screen.
 */

export function formatPkr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "Rs. 0";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}Rs. ${grouped}`;
}

/** Compact form for chart axes and tight stat cards. */
export function formatPkrShort(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `Rs. ${(amount / 10_000_000).toFixed(1)}cr`;
  if (abs >= 100_000) return `Rs. ${(amount / 100_000).toFixed(1)}L`;
  if (abs >= 1000) return `Rs. ${(amount / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return formatPkr(amount);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Stored timestamps are UTC but written without a zone designator by SQLite's
  // date functions, so an explicit Z is added rather than letting the browser
  // guess local time.
  const normalized = /\d{2}:\d{2}/.test(value) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? `${value}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "14 Mar 2026" */
export function formatDate(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "14 Mar, 3:40 pm" — used in visit lists where the time matters. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "—";
  const hours = date.getHours();
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${twelve}:${minutes} ${suffix}`;
}

/** "3 days ago" / "in 5 days" — the form the retention screens need. */
export function relativeDays(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "—";
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  const ago = Math.abs(days);
  if (ago < 30) return `${ago} days ago`;
  if (ago < 365) return `${Math.round(ago / 30)} months ago`;
  return `${(ago / 365).toFixed(1)} years ago`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Renders a stored E.164 number the way a Pakistani receptionist reads it. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("+92") && phone.length === 13) {
    return `0${phone.slice(3, 6)} ${phone.slice(6)}`;
  }
  return phone;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  active: "Active",
  due: "Due back",
  at_risk: "At risk",
  lost: "Lost"
};

const STATUS_CLASSES: Record<string, string> = {
  new: "badge-brand",
  active: "badge-active",
  due: "badge-due",
  at_risk: "badge-risk",
  lost: "badge-lost"
};

export function retentionLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function retentionClass(status: string): string {
  return STATUS_CLASSES[status] ?? "badge-neutral";
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "raast", label: "Raast" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "card", label: "Card" },
  { value: "unpaid", label: "Unpaid (bill later)" }
] as const;

export function paymentLabel(method: string | null): string {
  return PAYMENT_METHODS.find((entry) => entry.value === method)?.label ?? method ?? "—";
}

const SEGMENT_LABELS: Record<string, string> = {
  at_risk: "At-risk customers",
  lapsed: "Lapsed customers",
  never_returned: "One visit only",
  high_value: "Highest spenders",
  birthday_month: "Birthdays this month",
  all: "Everyone who consented"
};

/** Plain English for a stored campaign segment. */
export function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

const CAMPAIGN_STATUS_CLASSES: Record<string, string> = {
  draft: "badge-neutral",
  sending: "badge-brand",
  sent: "badge-active",
  completed: "badge-active",
  failed: "badge-lost"
};

export function campaignStatusClass(status: string): string {
  return CAMPAIGN_STATUS_CLASSES[status] ?? "badge-neutral";
}

/** Initials for the avatar bubble in customer lists. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}
