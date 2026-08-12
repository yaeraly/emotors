import type {
  BranchPurchaseRequestItem,
  PricingAppliedRuleType,
  PricingAdjustmentMode,
  Product,
} from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
} from '../pricing/product-cost-precision.util';
import { applyHqBranchInternalDistributionProfit } from '../distribution/hq-branch-distribution-profit.util';
import { resolveBranchPurchaseApprovedInvoiceLine } from './branch-purchase-invoice-lines.util';

export type ConfirmedDistributionLineInput = {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  resolvedPriceKgs: number;
  baseCostKgs: number;
  baseBranchPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType | null;
  appliedRuleId: string | null;
  appliedAdjustmentMode: PricingAdjustmentMode | null;
  appliedAdjustmentValue: number | null;
  priceResolvedAt: Date | null;
};

export function buildDistributionLinesFromConfirmedRequestItems(
  items: Array<
    Pick<
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
    >
  >,
  productsById: Map<string, Pick<Product, 'id' | 'sku' | 'name' | 'finalCostKgs'>>,
  options?: { branchType?: string | null },
): ConfirmedDistributionLineInput[] {
  const lines: ConfirmedDistributionLineInput[] = [];

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

    const authoritativeLineCost =
      item.estimatedLineProductCostKgs != null && Number(item.estimatedLineProductCostKgs) > 0
        ? roundDisplayMoney(Number(item.estimatedLineProductCostKgs))
        : null;
    // Never rebuild HQ transfer cost from rounded display unit × quantity.
    const lineCost = authoritativeLineCost ?? 0;
    if (lineCost <= 0) {
      throw new Error(`Authoritative FIFO line cost missing for product ${item.sku}`);
    }
    const unitCost = deriveDisplayUnitCost(lineCost, quantity);

    lines.push(
      applyHqBranchInternalDistributionProfit(
        {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          quantity,
          unitCost,
          unitPrice,
          totalCost: lineCost,
          totalPrice: linePrice,
          profit: roundDisplayMoney(linePrice - lineCost),
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
        },
        options?.branchType,
      ),
    );
  }

  return lines;
}
