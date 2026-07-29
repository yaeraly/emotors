import { Prisma } from '@prisma/client';

export type ResolvedBranchPurchaseItem = {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  currentBranchStock: number;
  hqAvailableStock: number | null;
  hqPhysicalStock?: number | null;
  wholesalePriceKgs: number;
  resolvedBranchPriceKgs: number | null;
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  appliedRuleType: Prisma.BranchPurchaseRequestItemCreateWithoutRequestInput['appliedRuleType'];
  appliedRuleId: string | null;
  appliedAdjustmentMode: Prisma.BranchPurchaseRequestItemCreateWithoutRequestInput['appliedAdjustmentMode'];
  appliedAdjustmentValue: number | null;
  priceResolvedAt: Date | null;
  hasPricingPolicyAtSubmit: boolean;
  weightKg: number;
  transportExpenseAllocation: number;
  estimatedUnitCost: number;
  estimatedLineProductCostKgs: number;
  totalAmount: number;
  note?: string;
};

export function toBranchPurchaseRequestItemCreate(
  item: ResolvedBranchPurchaseItem,
): Prisma.BranchPurchaseRequestItemCreateWithoutRequestInput {
  return {
    productId: item.productId,
    sku: item.sku,
    productName: item.productName,
    quantity: item.quantity,
    unit: item.unit,
    currentBranchStock: item.currentBranchStock,
    hqAvailableStock: item.hqAvailableStock,
    hqPhysicalStock: item.hqPhysicalStock ?? undefined,
    wholesalePriceKgs: item.wholesalePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    pricingPolicyVersionId: item.pricingPolicyVersionId,
    pricingProfileId: item.pricingProfileId,
    appliedRuleType: item.appliedRuleType,
    appliedRuleId: item.appliedRuleId,
    appliedAdjustmentMode: item.appliedAdjustmentMode,
    appliedAdjustmentValue: item.appliedAdjustmentValue,
    priceResolvedAt: item.priceResolvedAt,
    hasPricingPolicyAtSubmit: item.hasPricingPolicyAtSubmit,
    weightKg: item.weightKg,
    transportExpenseAllocation: item.transportExpenseAllocation,
    estimatedUnitCost: item.estimatedUnitCost,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    totalAmount: item.totalAmount,
    note: item.note,
  };
}
