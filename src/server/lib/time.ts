/**
 * Time helpers.
 *
 * Everything is stored in UTC. Business-day boundaries are computed in the
 * organization's own timezone, because a Pakistani salon owner looking at
 * "today's revenue" at 2am PKT must not see yesterday's figures — UTC day
 * boundaries are 5 hours out for PKT.
 */

export const DEFAULT_TIMEZONE = "Asia/Karachi";

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

export function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/**
 * Returns the UTC instant of local midnight for the given day offset in `timeZone`.
 * `dayOffset: 0` is the start of today, `-1` the start of yesterday.
 */
export function startOfLocalDay(timeZone: string, dayOffset = 0, reference = new Date()): Date {
  const parts = localParts(timeZone, reference);
  // Reconstruct the local wall-clock date at 00:00, then convert back to UTC by
  // subtracting the zone's offset at that instant.
  const localMidnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 0, 0, 0);
  const offsetMs = zoneOffsetMs(timeZone, new Date(localMidnightAsUtc));
  return new Date(localMidnightAsUtc - offsetMs);
}

/** Start of the local month containing `reference`, as a UTC instant. */
export function startOfLocalMonth(timeZone: string, reference = new Date()): Date {
  const parts = localParts(timeZone, reference);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, 1, 0, 0, 0);
  return new Date(localAsUtc - zoneOffsetMs(timeZone, new Date(localAsUtc)));
}

function localParts(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const found: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") found[part.type] = Number(part.value);
  }
  return {
    year: found.year ?? date.getUTCFullYear(),
    month: found.month ?? date.getUTCMonth() + 1,
    day: found.day ?? date.getUTCDate(),
    hour: found.hour ?? 0,
    minute: found.minute ?? 0,
    second: found.second ?? 0
  };
}

/** The timezone's UTC offset in milliseconds at a given instant. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const p = localParts(timeZone, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Formats a UTC timestamp for display in the business's timezone. */
export function formatInZone(
  iso: string,
  timeZone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
}

/**
 * D1 stores timestamps written by `datetime('now')` as `YYYY-MM-DD HH:MM:SS`
 * without a zone marker, while application writes use full ISO strings. This
 * normalises both into a comparable Date.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
