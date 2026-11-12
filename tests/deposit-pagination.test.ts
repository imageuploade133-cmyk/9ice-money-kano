import { describe, expect, test } from "bun:test";

describe("Admin Deposit Console Pagination Architecture Suite", () => {
  test("1. Page size normalization enforces safe bounds between 1 and 50", () => {
    const normalizePageSize = (limitParam?: string | number | null) => {
      const num = Number(limitParam) || 10;
      return Math.min(Math.max(num, 1), 50);
    };

    expect(normalizePageSize(10)).toBe(10);
    expect(normalizePageSize(0)).toBe(10);
    expect(normalizePageSize(-5)).toBe(1);
    expect(normalizePageSize(100)).toBe(50);
    expect(normalizePageSize(undefined)).toBe(10);
  });

  test("2. Total page calculation evaluates total pages accurately", () => {
    const getTotalPages = (totalCount: number, pageSize: number = 10) => {
      if (totalCount <= 0) return 1;
      return Math.ceil(totalCount / pageSize);
    };

    expect(getTotalPages(0)).toBe(1);
    expect(getTotalPages(5, 10)).toBe(1);
    expect(getTotalPages(10, 10)).toBe(1);
    expect(getTotalPages(11, 10)).toBe(2);
    expect(getTotalPages(45, 10)).toBe(5);
  });

  test("3. Cursor stack navigation tracks Next and Previous page cursors correctly", () => {
    let cursorStack: string[] = [];
    let currentPage = 1;

    // Simulate Page 1 -> Page 2 transition
    const page1LastDoc = "doc-id-10";
    cursorStack = [...cursorStack, page1LastDoc];
    currentPage += 1;

    expect(currentPage).toBe(2);
    expect(cursorStack).toEqual(["doc-id-10"]);

    // Simulate Page 2 -> Page 3 transition
    const page2LastDoc = "doc-id-20";
    cursorStack = [...cursorStack, page2LastDoc];
    currentPage += 1;

    expect(currentPage).toBe(3);
    expect(cursorStack).toEqual(["doc-id-10", "doc-id-20"]);

    // Simulate Page 3 -> Page 2 (Previous)
    const prevCursorForPage2 = cursorStack[cursorStack.length - 2]; // "doc-id-10"
    cursorStack = cursorStack.slice(0, -1);
    currentPage = Math.max(1, currentPage - 1);

    expect(currentPage).toBe(2);
    expect(prevCursorForPage2).toBe("doc-id-10");
    expect(cursorStack).toEqual(["doc-id-10"]);

    // Simulate Page 2 -> Page 1 (Previous)
    const prevCursorForPage1 = cursorStack[cursorStack.length - 2]; // undefined (root query)
    cursorStack = cursorStack.slice(0, -1);
    currentPage = Math.max(1, currentPage - 1);

    expect(currentPage).toBe(1);
    expect(prevCursorForPage1).toBeUndefined();
    expect(cursorStack).toEqual([]);
  });
});
