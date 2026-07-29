import type {
  BranchPurchaseRequestItem,
  PricingAppliedRuleType,
  PricingAdjustmentMode,
  Product,
} from '@prisma/client';

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
        ? Math.round((Number(item.approvedLineTotalKgs) + Number.EPSILON) * 100) / 100
        : Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100;
    const unitCostRaw =
      Number(item.estimatedUnitCost ?? 0) > 0 ? Number(item.estimatedUnitCost) : Number(product.finalCostKgs);
    const unitCost = Math.round((unitCostRaw + Number.EPSILON) * 100) / 100;
    const lineCost = Math.round((unitCost * quantity + Number.EPSILON) * 100) / 100;

    lines.push({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      quantity,
      unitCost,
      unitPrice,
      totalCost: lineCost,
      totalPrice: linePrice,
      profit: Math.round((linePrice - lineCost + Number.EPSILON) * 100) / 100,
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
