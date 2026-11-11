/**
 * Helper utility for transaction date and time formatting.
 * Strictly presents UTC backend timestamps in the user's target display timezone
 * (defaulting to "Africa/Lagos" WAT UTC+1 if no user/device timezone mechanism exists)
 * without altering stored UTC timestamps or Firestore records.
 */

export interface FormattedDateTime {
  date: string;     // e.g. "Sep 01, 2026"
  time: string;     // e.g. "02:38 PM"
  dateTime: string; // e.g. "Sep 01, 2026 02:38 PM"
}

export const DEFAULT_TIMEZONE = "Africa/Lagos";

/**
 * Resolves the active user or device timezone, falling back to "Africa/Lagos".
 */
export function getDisplayTimezone(): string {
  if (typeof window !== "undefined") {
    try {
      const userTz = localStorage.getItem("user_timezone") || sessionStorage.getItem("user_timezone");
      if (userTz) return userTz;
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (deviceTz) return deviceTz;
    } catch {
      // Ignore errors accessing window/storage
    }
  }
  return DEFAULT_TIMEZONE;
}

/**
 * Formats a transaction date/time into localized display components.
 * Accepts ISO UTC strings, Firestore timestamp objects, or legacy date/time fallbacks.
 */
export function formatTransactionDateTime(
  rawCreatedAt?: string | number | { seconds?: number; nanoseconds?: number } | null,
  fallbackDate?: string,
  fallbackTime?: string,
  targetTimezone?: string
): FormattedDateTime {
  const tz = targetTimezone || getDisplayTimezone();
  let dateObj: Date | null = null;

  if (rawCreatedAt) {
    if (typeof rawCreatedAt === "string") {
      // Ensure ISO string with 'Z' or offset parses as UTC
      dateObj = new Date(rawCreatedAt);
    } else if (typeof rawCreatedAt === "number") {
      dateObj = new Date(rawCreatedAt);
    } else if (typeof rawCreatedAt === "object" && typeof rawCreatedAt.seconds === "number") {
      dateObj = new Date(rawCreatedAt.seconds * 1000);
    }
  }

  // If createdAt is missing or invalid, use fallback date/time strings directly without timezone shift
  if (!dateObj || isNaN(dateObj.getTime())) {
    if (fallbackDate) {
      const formattedDate = fallbackDate;
      const formattedTime = fallbackTime || "";
      const combined = formattedTime ? `${formattedDate} ${formattedTime}` : formattedDate;
      return { date: formattedDate, time: formattedTime, dateTime: combined };
    }
    dateObj = new Date();
  }

  try {
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const formattedDate = dateFormatter.format(dateObj); // "Sep 01, 2026"
    const formattedTime = timeFormatter.format(dateObj); // "02:38 PM"

    return {
      date: formattedDate,
      time: formattedTime,
      dateTime: `${formattedDate} ${formattedTime}`,
    };
  } catch {
    // Fallback formatting if Intl fails
    const formattedDate = fallbackDate || dateObj.toLocaleDateString("en-US");
    const formattedTime = fallbackTime || dateObj.toLocaleTimeString("en-US");
    return {
      date: formattedDate,
      time: formattedTime,
      dateTime: `${formattedDate} ${formattedTime}`,
    };
  }
}
