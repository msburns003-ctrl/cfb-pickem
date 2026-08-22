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

/**
 * Converts a "YYYY-MM-DDTHH:mm" wall-clock value (as typed into a
 * datetime-local input, intended to mean Eastern Time) into the correct
 * UTC ISO timestamp for storage — independent of the entering browser's
 * own local time zone.
 */
export function easternInputValueToIso(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Step 1: treat the entered numbers as if they were already UTC.
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Step 2: see what wall-clock Eastern Time that UTC instant displays as.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(guessUtc)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const shownHour = parts.hour === "24" ? 0 : Number(parts.hour);
  const shownAsEasternUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    shownHour,
    Number(parts.minute),
    Number(parts.second),
  );

  // Step 3: the gap between the two tells us the Eastern offset for this
  // date (handles EST/EDT automatically); apply it to get the real UTC instant.
  const offsetMs = guessUtc.getTime() - shownAsEasternUtc;
  return new Date(guessUtc.getTime() + offsetMs).toISOString();
}
