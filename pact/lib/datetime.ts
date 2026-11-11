export type TimestampFormatMode = "time" | "timeWithSeconds" | "date" | "datetime";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Parses a date input into a valid Date instance, returning null for empty or invalid values.
 */
export function parseValidDate(
  value: string | number | Date | null | undefined
): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a timestamp deterministically in UTC without relying on runtime ICU locale rules,
 * guaranteeing identical output on Node SSR and initial browser hydration.
 */
export function formatUtcTimestamp(
  value: string | number | Date | null | undefined,
  mode: TimestampFormatMode = "datetime",
  fallback = "—"
): string {
  const date = parseValidDate(value);
  if (!date) return fallback;

  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  const seconds = pad2(date.getUTCSeconds());

  switch (mode) {
    case "time":
      return `${hours}:${minutes} UTC`;
    case "timeWithSeconds":
      return `${hours}:${minutes}:${seconds} UTC`;
    case "date":
      return `${year}-${month}-${day}`;
    case "datetime":
    default:
      return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
  }
}

/**
 * Formats a timestamp using the active runtime's locale settings (call only after client mount).
 */
export function formatLocalTimestamp(
  value: string | number | Date | null | undefined,
  mode: TimestampFormatMode = "datetime",
  fallback = "—"
): string {
  const date = parseValidDate(value);
  if (!date) return fallback;

  switch (mode) {
    case "time":
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "timeWithSeconds":
      return date.toLocaleTimeString();
    case "date":
      return date.toLocaleDateString();
    case "datetime":
    default:
      return date.toLocaleString();
  }
}

/**
 * Returns an ISO-8601 UTC timestamp string when valid, or an empty string otherwise.
 */
export function formatIsoTimestamp(
  value: string | number | Date | null | undefined
): string {
  const date = parseValidDate(value);
  return date ? date.toISOString() : "";
}

