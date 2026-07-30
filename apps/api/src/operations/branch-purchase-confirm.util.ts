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
      | 'approvedQuantity'
      | 'resolvedBranchPriceKgs'
      | 'approvedLineTotalKgs'
      | 'estimatedUnitCost'
      | 'estimatedLineProductCostKgs'
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
): ConfirmedDistributionLineInput[] {
  const lines: ConfirmedDistributionLineInput[] = [];

  for (const item of items) {
    const quantity = item.approvedQuantity ?? 0;
    if (quantity <= 0) continue;

    const product = productsById.get(item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const unitPrice = Number(item.resolvedBranchPriceKgs ?? 0);
    if (unitPrice <= 0) {
      throw new Error(`Approved price missing for product ${item.sku}`);
    }
    const linePrice =
      item.approvedLineTotalKgs != null
        ? roundDisplayMoney(Number(item.approvedLineTotalKgs))
        : roundDisplayMoney(unitPrice * quantity);

    const authoritativeLineCost =
      item.estimatedLineProductCostKgs != null && Number(item.estimatedLineProductCostKgs) > 0
        ? roundDisplayMoney(Number(item.estimatedLineProductCostKgs))
        : null;
    const unitCostRaw =
      Number(item.estimatedUnitCost ?? 0) > 0
        ? Number(item.estimatedUnitCost)
        : Number(product.finalCostKgs);
    const lineCost =
      authoritativeLineCost ?? roundDisplayMoney(unitCostRaw * quantity);
    const unitCost = deriveDisplayUnitCost(lineCost, quantity);

    lines.push({
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
      baseCostKgs: unitCostRaw,
      baseBranchPriceKgs: unitPrice,
      appliedRuleType: item.appliedRuleType,
      appliedRuleId: item.appliedRuleId,
      appliedAdjustmentMode: item.appliedAdjustmentMode,
      appliedAdjustmentValue: item.appliedAdjustmentValue != null ? Number(item.appliedAdjustmentValue) : null,
      priceResolvedAt: item.priceResolvedAt,
    });
  }

  return lines;
}
