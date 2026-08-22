// Central Eastern Time helpers. The league is Eastern-based, so every
// displayed date/time and every admin-entered date/time is anchored to
// America/New_York regardless of the viewing device's local time zone.

export const LEAGUE_TIME_ZONE = "America/New_York";

/**
 * Formats an ISO/UTC timestamp string in Eastern Time, appending an "ET"
 * suffix so it's unambiguous. Accepts the same options as
 * Intl.DateTimeFormat (minus timeZone, which is fixed to Eastern).
 */
export function formatEastern(
  iso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const formatted = new Date(iso).toLocaleString("en-US", {
    ...options,
    timeZone: LEAGUE_TIME_ZONE,
  });
  return `${formatted} ET`;
}

/**
 * Converts a UTC ISO timestamp into the "YYYY-MM-DDTHH:mm" string shape
 * expected by <input type="datetime-local">, representing the equivalent
 * wall-clock time in Eastern Time (not the browser's local time zone).
 */
export function isoToEasternInputValue(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

const INPUT_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// Standard-time and daylight-time UTC offsets used by America/New_York.
// Trying both and checking which one round-trips exactly is robust across
// the whole year, including both DST transition days.
const CANDIDATE_OFFSET_HOURS = [4, 5];

function formatAsEasternParts(date: Date): Record<string, string> {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
}

/**
 * Converts a "YYYY-MM-DDTHH:mm" wall-clock value (as typed into a
 * datetime-local input, intended to mean Eastern Time) into the correct
 * UTC ISO timestamp for storage — independent of the entering browser's
 * own local time zone.
 *
 * Tries both possible Eastern UTC offsets (EDT/-4 and EST/-5) and picks
 * whichever one, once converted, formats back to the exact wall-clock
 * value that was entered. This stays correct through both DST transition
 * days, unlike a single-guess conversion which can be off by an hour in
 * the hours just after the spring-forward change. Throws a clear error
 * for malformed or out-of-range input instead of silently saving the
 * wrong date.
 */
export function easternInputValueToIso(value: string): string {
  const match = INPUT_VALUE_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Invalid date/time value "${value}": expected format YYYY-MM-DDTHH:mm`,
    );
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    throw new Error(`Invalid date/time value "${value}": field out of range`);
  }

  let fallbackUtc: Date | null = null;
  for (const offsetHours of CANDIDATE_OFFSET_HOURS) {
    const candidateUtc = new Date(
      Date.UTC(year, month - 1, day, hour + offsetHours, minute),
    );
    const parts = formatAsEasternParts(candidateUtc);
    const shownHour = parts.hour === "24" ? 0 : Number(parts.hour);
    const matches =
      Number(parts.year) === year &&
      Number(parts.month) === month &&
      Number(parts.day) === day &&
      shownHour === hour &&
      Number(parts.minute) === minute;
    if (matches) {
      return candidateUtc.toISOString();
    }
    if (!fallbackUtc) fallbackUtc = candidateUtc;
  }

  // Neither offset round-tripped exactly — this only happens for the
  // ~1-hour wall-clock gap skipped during the spring-forward transition
  // (e.g. 2:30 AM on the second Sunday in March, which never occurs).
  // Fall back to the EDT-offset guess rather than throwing, since that is
  // the nearest valid instant just after the skipped hour.
  return (fallbackUtc as Date).toISOString();
}
