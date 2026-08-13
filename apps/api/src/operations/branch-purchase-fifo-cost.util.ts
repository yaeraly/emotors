import type { BranchType, Prisma } from '@prisma/client';
import type { PricingFifoService } from '../pricing/pricing-fifo.service';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

type PrismaTx = Prisma.TransactionClient;

export type BranchPurchaseFifoLineCost = {
  estimatedLineProductCostKgs: number;
  estimatedUnitCost: number;
};

export async function resolveBranchPurchaseFifoLineCost(
  pricingFifoService: PricingFifoService,
  tx: PrismaTx,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    branchType?: BranchType | null;
    hqToBranchMarkupPercent?: number | null;
    fallbackUnitCost?: number;
    fallbackUnitPrice?: number;
  },
): Promise<BranchPurchaseFifoLineCost & { allocatedQty: number }> {
  const isHqOwnedBranch = input.branchType
    ? pricingFifoService.isHqBranchType(input.branchType)
    : false;
  const fifoPreview = await pricingFifoService.previewFifoAllocation(tx, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    isHqOwnedBranch,
    branchPricing: input.branchType
      ? {
          branchType: input.branchType,
          hqToBranchMarkupPercent: Number(input.hqToBranchMarkupPercent ?? 0),
        }
      : undefined,
    preferPerLayerMarkup: true,
    subtractReserved: true,
    fallbackUnitCost: input.fallbackUnitCost,
    fallbackUnitPrice: input.fallbackUnitPrice,
  });

  const estimatedLineProductCostKgs = roundDisplayMoney(fifoPreview.totalCostKgs);
  return {
    estimatedLineProductCostKgs,
    estimatedUnitCost: deriveDisplayUnitCost(estimatedLineProductCostKgs, input.quantity),
    allocatedQty: fifoPreview.allocatedQty,
  };
}

export function sumBranchPurchaseLineProductCosts(costs: number[]) {
  return sumDisplayMoneyTotals(costs);
}

/**
 * Authoritative line cost for BPR enrichment: live FIFO when available, stored only when
 * transfer is locked or FIFO cannot allocate (never unit×qty recompute).
 */
export function resolveEnrichedBranchPurchaseLineCost(input: {
  storedLineCostKgs: number;
  fifoLineCostKgs: number;
  fifoAllocatedQty: number;
  lineQuantity: number;
  transferCostLocked: boolean;
}): BranchPurchaseFifoLineCost {
  const lineQuantity = Math.max(0, input.lineQuantity);
  if (lineQuantity <= 0) {
    return { estimatedLineProductCostKgs: 0, estimatedUnitCost: 0 };
  }

  const storedLineCost = roundDisplayMoney(input.storedLineCostKgs);
  const fifoLineCost = roundDisplayMoney(input.fifoLineCostKgs);
  const fifoAllocatedQty = Math.max(0, input.fifoAllocatedQty);

  if (input.transferCostLocked && storedLineCost > 0) {
    return {
      estimatedLineProductCostKgs: storedLineCost,
      estimatedUnitCost: deriveDisplayUnitCost(storedLineCost, lineQuantity),
    };
  }

  if (fifoAllocatedQty > 0 && fifoLineCost > 0) {
    return {
      estimatedLineProductCostKgs: fifoLineCost,
      estimatedUnitCost: deriveDisplayUnitCost(fifoLineCost, lineQuantity),
    };
  }

  if (storedLineCost > 0) {
    return {
      estimatedLineProductCostKgs: storedLineCost,
      estimatedUnitCost: deriveDisplayUnitCost(storedLineCost, lineQuantity),
    };
  }

  return { estimatedLineProductCostKgs: 0, estimatedUnitCost: 0 };
}
