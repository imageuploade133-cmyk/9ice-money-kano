export interface TransferTieredMarkup {
  id: string;
  minAmount: number;
  maxAmount: number;
  fee: number;
}

/**
 * Calculates the applicable transfer profit markup fee based on configured tiered amount ranges.
 * If the transfer amount falls within [minAmount, maxAmount], returns the tier fee.
 * If the transfer amount does not match any configured range, falls back to defaultMarkup.
 */
export function calculateTransferMarkupFee(
  amount: number,
  defaultMarkup: number,
  tieredRules: TransferTieredMarkup[] = []
): number {
  const numAmount = Number(amount) || 0;
  const fallbackFee = Math.max(0, Number(defaultMarkup) || 0);

  if (!Array.isArray(tieredRules) || tieredRules.length === 0) {
    return fallbackFee;
  }

  // Find matching range tier
  const matchingTier = tieredRules.find((tier) => {
    const min = Number(tier.minAmount) || 0;
    const max = Number(tier.maxAmount) || 0;
    return numAmount >= min && numAmount <= max;
  });

  if (matchingTier && matchingTier.fee !== undefined && !isNaN(matchingTier.fee)) {
    return Math.max(0, Number(matchingTier.fee));
  }

  return fallbackFee;
}
