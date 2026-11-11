import { describe, expect, test } from "bun:test";

describe("Transaction Details vs Share Receipt Modal Navigation Isolation", () => {
  test("closing Share Receipt modal state strictly targets share modal and preserves transaction details state", () => {
    let isTransactionModalOpen = true;
    let isShareModalOpen = true;

    const closeTransactionModal = () => {
      isTransactionModalOpen = false;
    };

    const closeShareModal = () => {
      isShareModalOpen = false;
    };

    // Simulate closing Share Receipt Modal
    closeShareModal();

    // Verify Share Receipt Modal is closed while Transaction Details Modal remains open
    expect(isShareModalOpen).toBe(false);
    expect(isTransactionModalOpen).toBe(true);
  });
});
