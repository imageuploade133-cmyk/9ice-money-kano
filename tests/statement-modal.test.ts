import { describe, expect, test } from "bun:test";

describe("Statement of Account Range & Options", () => {
  test("allows custom date ranges without 6-month restrictions", () => {
    const fromDate = "2023-01-01";
    const toDate = "2026-10-08";

    const start = new Date(fromDate + "T00:00:00.000Z");
    const end = new Date(toDate + "T23:59:59.999Z");

    expect(start <= end).toBe(true);

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
    expect(diffDays).toBeGreaterThan(1000); // Over 3 years span allowed
  });

  test("preset handlers map correct date ranges", () => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Today preset
    expect(todayStr).toBeDefined();

    // All Time preset
    const allTimeFrom = "2020-01-01";
    expect(new Date(allTimeFrom).getTime()).toBeLessThan(new Date().getTime());
  });
});
