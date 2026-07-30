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
