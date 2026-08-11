import type { BranchPurchaseRequestItem, Product } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseApprovedInvoiceLine } from './branch-purchase-invoice-lines.util';

export type BranchPurchaseConfirmLineSnapshot = {
  approvedQuantity?: number | null;
  estimatedLineProductCostKgs?: unknown;
};

export type BranchPurchaseCommercialAgreementLine = {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  hasInventoryCostSnapshot: boolean;
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  resolvedPriceKgs: number;
  baseCostKgs: number;
  baseBranchPriceKgs: number;
  appliedRuleType: BranchPurchaseRequestItem['appliedRuleType'];
  appliedRuleId: string | null;
  appliedAdjustmentMode: BranchPurchaseRequestItem['appliedAdjustmentMode'];
  appliedAdjustmentValue: number | null;
  priceResolvedAt: Date | null;
};

/**
 * Branch Sales «Согласовать заказ» is commercial/workflow confirmation only.
 * Inventory FIFO is validated/consumed later at Branch Accountant DO approve / HQ Warehouse.
 */
export function sumPersistedApprovedInventoryCostKgs(
  items: BranchPurchaseConfirmLineSnapshot[],
): number {
  return sumDisplayMoneyTotals(
    items
      .filter((item) => (item.approvedQuantity ?? 0) > 0)
      .map((item) => roundDisplayMoney(Number(item.estimatedLineProductCostKgs ?? 0)))
      .filter((value) => value > 0),
  );
}

/**
 * Build draft distribution order lines from HQ-approved commercial snapshots only.
 * Missing `estimatedLineProductCostKgs` must NOT block branch agreement — inventory
 * cost is populated later at distribution approve (FIFO reserve), not here.
 */
export function buildBranchPurchaseCommercialAgreementLines<
  T extends Pick<
    BranchPurchaseRequestItem,
    | 'productId'
    | 'sku'
    | 'productName'
    | 'quantity'
    | 'approvedQuantity'
    | 'lineStatus'
    | 'resolvedBranchPriceKgs'
    | 'approvedLineTotalKgs'
    | 'totalAmount'
    | 'estimatedUnitCost'
    | 'estimatedLineProductCostKgs'
    | 'hasPricingPolicyAtReview'
    | 'hasPricingPolicyAtSubmit'
    | 'pricingPolicyVersionId'
    | 'pricingProfileId'
    | 'appliedRuleType'
    | 'appliedRuleId'
    | 'appliedAdjustmentMode'
    | 'appliedAdjustmentValue'
    | 'priceResolvedAt'
  >,
>(
  items: T[],
  productsById: Map<string, Pick<Product, 'id' | 'sku' | 'name' | 'finalCostKgs'>>,
  options?: { branchType?: string | null },
): BranchPurchaseCommercialAgreementLine[] {
  const lines: BranchPurchaseCommercialAgreementLine[] = [];

  for (const item of items) {
    const quantity = item.approvedQuantity ?? 0;
    if (quantity <= 0) continue;

    const product = productsById.get(item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const approvedLine = resolveBranchPurchaseApprovedInvoiceLine({
      ...item,
      branchType: options?.branchType ?? null,
    });
    const unitPrice = approvedLine.unitPrice;
    if (unitPrice <= 0) {
      throw new Error(`Approved price missing for product ${item.sku}`);
    }
    const linePrice = approvedLine.lineTotal;

    const inventoryLineCost =
      item.estimatedLineProductCostKgs != null && Number(item.estimatedLineProductCostKgs) > 0
        ? roundDisplayMoney(Number(item.estimatedLineProductCostKgs))
        : null;
    const hasInventoryCostSnapshot = inventoryLineCost != null && inventoryLineCost > 0;

    // Draft DO inventory cost stays unset until Branch Accountant `approve()` FIFO reserve.
    const lineCost = hasInventoryCostSnapshot ? inventoryLineCost! : 0;
    const unitCost = hasInventoryCostSnapshot ? deriveDisplayUnitCost(lineCost, quantity) : 0;

    lines.push({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      quantity,
      unitCost,
      unitPrice,
      totalCost: lineCost,
      totalPrice: linePrice,
      profit: hasInventoryCostSnapshot ? roundDisplayMoney(linePrice - lineCost) : 0,
      hasInventoryCostSnapshot,
      pricingPolicyVersionId: item.pricingPolicyVersionId,
      pricingProfileId: item.pricingProfileId,
      resolvedPriceKgs: unitPrice,
      baseCostKgs: Number(item.estimatedUnitCost ?? unitCost),
      baseBranchPriceKgs: unitPrice,
      appliedRuleType: item.appliedRuleType,
      appliedRuleId: item.appliedRuleId,
      appliedAdjustmentMode: item.appliedAdjustmentMode,
      appliedAdjustmentValue:
        item.appliedAdjustmentValue != null ? Number(item.appliedAdjustmentValue) : null,
      priceResolvedAt: item.priceResolvedAt,
    });
  }

  return lines;
}

export function sumBranchPurchaseCommercialAgreementTotalKgs(
  lines: Array<{ totalPrice: number }>,
): number {
  return sumDisplayMoneyTotals(lines.map((line) => line.totalPrice));
}

export function sumBranchPurchaseCommercialAgreementInventoryCostKgs(
  lines: Array<{ totalCost: number; hasInventoryCostSnapshot: boolean }>,
): number {
  return sumDisplayMoneyTotals(
    lines.filter((line) => line.hasInventoryCostSnapshot).map((line) => line.totalCost),
  );
}

export function allBranchPurchaseAgreementLinesHaveInventoryCostSnapshot(
  lines: Array<{ hasInventoryCostSnapshot: boolean }>,
): boolean {
  return lines.length > 0 && lines.every((line) => line.hasInventoryCostSnapshot);
}
