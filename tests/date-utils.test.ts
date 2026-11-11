import { describe, expect, test } from "bun:test";
import { formatTransactionDateTime } from "../src/lib/date-utils";

describe("Transaction Date/Time Presentation", () => {
  test("Converts UTC ISO timestamp to WAT (Africa/Lagos) display format", () => {
    // 2026-09-01T13:38:47.000Z in UTC -> 02:38 PM in Africa/Lagos (UTC+1)
    const result = formatTransactionDateTime("2026-09-01T13:38:47.000Z", undefined, undefined, "Africa/Lagos");
    expect(result.date).toBe("Sep 01, 2026");
    expect(result.time).toBe("02:38 PM");
    expect(result.dateTime).toBe("Sep 01, 2026 02:38 PM");
  });

  test("Handles Firestore seconds timestamp objects accurately", () => {
    // 1788269927 is 2026-09-01T13:38:47Z
    const result = formatTransactionDateTime({ seconds: 1788269927 }, undefined, undefined, "Africa/Lagos");
    expect(result.date).toBe("Sep 01, 2026");
    expect(result.time).toBe("02:38 PM");
  });

  test("Preserves original UTC ISO string unchanged", () => {
    const rawUtcString = "2026-09-01T13:38:47.000Z";
    const result = formatTransactionDateTime(rawUtcString, undefined, undefined, "Africa/Lagos");

    // Output formatted string is transformed for display
    expect(result.dateTime).toBe("Sep 01, 2026 02:38 PM");
    // Original input variable remains strictly untouched
    expect(rawUtcString).toBe("2026-09-01T13:38:47.000Z");
  });

  test("Falls back to raw date/time strings when createdAt is missing", () => {
    const result = formatTransactionDateTime(null, "Sep 01, 2026", "02:38 PM", "Africa/Lagos");
    expect(result.date).toBe("Sep 01, 2026");
    expect(result.time).toBe("02:38 PM");
  });
});
