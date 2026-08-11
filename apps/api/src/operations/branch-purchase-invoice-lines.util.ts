import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseBranchUnitPriceKgs } from './branch-purchase-branch-display.util';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  resolveBranchPurchaseHqReviewEffectiveQuantity,
} from './branch-purchase-review-totals.util';

export type BranchPurchaseInvoiceLineSource = {
  id?: string;
  productId: string;
  sku?: string | null;
  productName?: string | null;
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  wholesalePriceKgs?: unknown;
  totalAmount?: unknown;
  approvedLineTotalKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  hasPricingPolicyAtSubmit?: boolean | null;
  branchType?: string | null;
};

export type BranchPurchaseInvoiceLine = {
  productId: string;
  sku: string | null;
  productName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** Approved BPR line → payable invoice line (never FIFO/catalog re-read). */
export function resolveBranchPurchaseApprovedInvoiceLine(
  item: BranchPurchaseInvoiceLineSource,
): BranchPurchaseInvoiceLine {
  const quantity = resolveBranchPurchaseHqReviewEffectiveQuantity(item);
  const branchUnit = resolveBranchPurchaseBranchUnitPriceKgs(item);
  // Commercial BPR snapshot only — inventory FIFO stays on estimatedLineProductCostKgs.
  const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
    quantity: item.quantity,
    approvedQuantity: item.approvedQuantity,
    lineStatus: item.lineStatus,
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    wholesalePriceKgs: item.wholesalePriceKgs,
    totalAmount: item.totalAmount,
    approvedLineTotalKgs: item.approvedLineTotalKgs,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    hasPricingPolicyAtReview:
      item.hasPricingPolicyAtReview ?? item.hasPricingPolicyAtSubmit ?? null,
    branchType: item.branchType,
  });

  if (quantity <= 0 || lineTotal <= 0) {
    return {
      productId: item.productId,
      sku: item.sku ?? null,
      productName: item.productName ?? null,
      quantity: 0,
      unitPrice: 0,
      lineTotal: 0,
    };
  }

  const unitPrice =
    branchUnit != null && branchUnit > 0
      ? branchUnit
      : deriveDisplayUnitCost(lineTotal, quantity);

  return {
    productId: item.productId,
    sku: item.sku ?? null,
    productName: item.productName ?? null,
    quantity,
    unitPrice,
    lineTotal,
  };
}

export function buildBranchPurchaseApprovedInvoiceLines(
  items: BranchPurchaseInvoiceLineSource[],
): BranchPurchaseInvoiceLine[] {
  return items
    .map((item) => resolveBranchPurchaseApprovedInvoiceLine(item))
    .filter((line) => line.quantity > 0 && line.lineTotal > 0);
}

export function sumBranchPurchaseApprovedInvoiceTotalKgs(
  items: BranchPurchaseInvoiceLineSource[],
): number {
  return sumDisplayMoneyTotals(
    buildBranchPurchaseApprovedInvoiceLines(items).map((line) => line.lineTotal),
  );
}

export type DistributionOrderItemPricePatch = {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitCost: number;
  totalCost: number;
  profit: number;
};

/** Align distribution order item selling prices with authoritative BPR approved snapshots. */
export function buildDistributionOrderItemPricePatches(
  bprItems: BranchPurchaseInvoiceLineSource[],
  orderItems: Array<{
    productId: string;
    unitCost?: unknown;
    totalCost?: unknown;
  }>,
): DistributionOrderItemPricePatch[] {
  const approvedByProduct = new Map(
    buildBranchPurchaseApprovedInvoiceLines(bprItems).map((line) => [line.productId, line]),
  );

  return orderItems
    .map((orderItem) => {
      const approved = approvedByProduct.get(orderItem.productId);
      if (!approved) return null;

      const totalCost = roundDisplayMoney(Number(orderItem.totalCost ?? 0));
      const unitCost = roundDisplayMoney(Number(orderItem.unitCost ?? 0));
      const totalPrice = approved.lineTotal;
      const unitPrice = approved.unitPrice;

      return {
        productId: orderItem.productId,
        quantity: approved.quantity,
        unitPrice,
        totalPrice,
        unitCost,
        totalCost,
        profit: roundDisplayMoney(totalPrice - totalCost),
      };
    })
    .filter((row): row is DistributionOrderItemPricePatch => row != null);
}
