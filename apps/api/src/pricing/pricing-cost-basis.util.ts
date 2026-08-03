/**
 * Stable pricing cost-basis selection for Pricing Policy / Branch Sales.
 *
 * Current HQ inventory cost (active remaining FIFO) and pricing cost basis are
 * different concerns. When HQ stock is fully transferred out, pricing must keep
 * using the latest valid published / historical cost — never collapse to 0.
 */

export type PricingCostBasisSource =
  | 'HQ_FIFO_ACTIVE_LAYER'
  | 'PRICING_POLICY_SNAPSHOT'
  | 'HQ_FIFO_DEPLETED_LAYER'
  | 'NO_COST_BASIS';

export type PricingCostBasisCandidate = {
  costPriceKgs: number;
  source: Exclude<PricingCostBasisSource, 'NO_COST_BASIS'>;
  sourceRecordId: string | null;
  receivedAt?: Date | string | null;
};

export type PricingCostBasisResult = {
  costPriceKgs: number;
  available: boolean;
  source: PricingCostBasisSource;
  sourceRecordId: string | null;
  receivedAt: Date | string | null;
};

export type FifoLayerCostCandidate = {
  id: string;
  remainingQuantity: number;
  unitCostKgs: number;
  receivedAt: Date | string;
};

/**
 * Pick the oldest active HQ FIFO layer (remainingQuantity > 0, cost > 0).
 * Used as priority #1 for pricing cost basis AND as the sole source for
 * current HQ inventory cost displays.
 */
export function selectActiveHqFifoCostBasis(
  layers: FifoLayerCostCandidate[],
): PricingCostBasisCandidate | null {
  const active = [...layers]
    .filter((layer) => layer.remainingQuantity > 0.009 && layer.unitCostKgs > 0.009)
    .sort((a, b) => {
      const byReceived = String(a.receivedAt).localeCompare(String(b.receivedAt));
      if (byReceived !== 0) return byReceived;
      return a.id.localeCompare(b.id);
    });
  const selected = active[0];
  if (!selected) return null;
  return {
    costPriceKgs: selected.unitCostKgs,
    source: 'HQ_FIFO_ACTIVE_LAYER',
    sourceRecordId: selected.id,
    receivedAt: selected.receivedAt,
  };
}

/**
 * Pick the latest depleted HQ FIFO layer that still carries a valid unit cost.
 * Used only as a pricing cost-basis fallback after stock reaches zero.
 */
export function selectDepletedHqFifoCostBasis(
  layers: FifoLayerCostCandidate[],
): PricingCostBasisCandidate | null {
  const depleted = [...layers]
    .filter((layer) => layer.remainingQuantity <= 0.009 && layer.unitCostKgs > 0.009)
    .sort((a, b) => {
      const byReceived = String(b.receivedAt).localeCompare(String(a.receivedAt));
      if (byReceived !== 0) return byReceived;
      return b.id.localeCompare(a.id);
    });
  const selected = depleted[0];
  if (!selected) return null;
  return {
    costPriceKgs: selected.unitCostKgs,
    source: 'HQ_FIFO_DEPLETED_LAYER',
    sourceRecordId: selected.id,
    receivedAt: selected.receivedAt,
  };
}

/**
 * Resolve pricing cost basis from pre-fetched candidates in priority order:
 * 1. Active published Pricing Policy product snapshot
 * 2. Latest valid depleted HQ FIFO receipt cost
 *
 * Active remaining FIFO is handled separately (priority 0 / first call).
 */
export function resolvePricingCostBasisFallback(input: {
  snapshotCostKgs?: number | null;
  snapshotId?: string | null;
  depletedLayers: FifoLayerCostCandidate[];
}): PricingCostBasisResult {
  const snapshotCost = Number(input.snapshotCostKgs ?? 0);
  if (Number.isFinite(snapshotCost) && snapshotCost > 0.009) {
    return {
      costPriceKgs: snapshotCost,
      available: true,
      source: 'PRICING_POLICY_SNAPSHOT',
      sourceRecordId: input.snapshotId ?? null,
      receivedAt: null,
    };
  }

  const depleted = selectDepletedHqFifoCostBasis(input.depletedLayers);
  if (depleted) {
    return {
      costPriceKgs: depleted.costPriceKgs,
      available: true,
      source: depleted.source,
      sourceRecordId: depleted.sourceRecordId,
      receivedAt: depleted.receivedAt ?? null,
    };
  }

  return {
    costPriceKgs: 0,
    available: false,
    source: 'NO_COST_BASIS',
    sourceRecordId: null,
    receivedAt: null,
  };
}

/**
 * Full priority resolution used by unit tests and documentation of the rule:
 * 1. Active HQ FIFO
 * 2. Active published Pricing Policy product snapshot
 * 3. Latest valid depleted HQ FIFO receipt cost
 */
export function resolvePricingCostBasis(input: {
  layers: FifoLayerCostCandidate[];
  snapshotCostKgs?: number | null;
  snapshotId?: string | null;
}): PricingCostBasisResult {
  const active = selectActiveHqFifoCostBasis(input.layers);
  if (active) {
    return {
      costPriceKgs: active.costPriceKgs,
      available: true,
      source: active.source,
      sourceRecordId: active.sourceRecordId,
      receivedAt: active.receivedAt ?? null,
    };
  }

  return resolvePricingCostBasisFallback({
    snapshotCostKgs: input.snapshotCostKgs,
    snapshotId: input.snapshotId,
    depletedLayers: input.layers,
  });
}

/** Never advertise CONFIGURED + price 0. */
export function normalizeConfiguredPrice(price: number | null | undefined): number | null {
  if (price == null) return null;
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0.009) return null;
  return value;
}
