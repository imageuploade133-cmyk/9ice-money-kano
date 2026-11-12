import { describe, expect, test } from "bun:test";
import { parseDataPlan, getDataPlanCategory, BillItem } from "../src/components/bills/types";

describe("Bills Components & Helpers Suite", () => {
  test("parseDataPlan correctly extracts size, duration, and display name", () => {
    const res1 = parseDataPlan("MTN Mobile Data Plan 1.5 GB - 30 days (SME)");
    expect(res1.size).toBe("1.5 GB");
    expect(res1.duration).toBe("SME");
    expect(res1.displayName).toBe("- 30 days");

    const res2 = parseDataPlan("1GB - 30 days");
    expect(res2.size).toBe("1GB");
    expect(res2.displayName).toBe("- 30 days");
  });

  test("getDataPlanCategory accurately classifies data plans", () => {
    const item1: BillItem = {
      id: 1,
      biller_code: "mtn",
      name: "2.5GB Weekend Plan [Sat & Sun]",
      item_code: "item1",
      amount: 500,
      is_fixed_amount: true,
    };
    expect(getDataPlanCategory(item1)).toBe("WEEKEND");

    const item2: BillItem = {
      id: 2,
      biller_code: "mtn",
      name: "1 GB Monthly SME Data",
      item_code: "item2",
      amount: 460,
      is_fixed_amount: true,
    };
    expect(getDataPlanCategory(item2)).toBe("1GB");

    const item3: BillItem = {
      id: 3,
      biller_code: "glo",
      name: "100MB Daily Awoof Data",
      item_code: "item3",
      amount: 100,
      is_fixed_amount: true,
    };
    expect(getDataPlanCategory(item3)).toBe("DAILY");

    const item4: BillItem = {
      id: 4,
      biller_code: "airtel",
      name: "7 days 2GB Weekly Plan",
      item_code: "item4",
      amount: 1000,
      is_fixed_amount: true,
    };
    expect(getDataPlanCategory(item4)).toBe("WEEKLY");

    const item5: BillItem = {
      id: 5,
      biller_code: "airtel",
      name: "10GB 30 Days Monthly Plan",
      item_code: "item5",
      amount: 3000,
      is_fixed_amount: true,
    };
    expect(getDataPlanCategory(item5)).toBe("MONTHLY");
  });
});
