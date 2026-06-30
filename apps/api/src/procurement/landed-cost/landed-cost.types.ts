export type ProcurementItemForAllocation = {
  id: string;
  quantity: number;
  confirmedQuantity: number | null;
  shippedQuantity: number | null;
  receivedQuantity: number | null;
  purchasePriceYuan: number;
  yuanRate: number;
  weightKg: number;
  manualAllocationKgs: number | null;
};

export type OrderTransportCosts = {
  /** China Domestic: Factory → China Warehouse */
  chinaLocalShippingKgs: number;
  /** China Export: China Warehouse → Bishkek */
  internationalShippingKgs: number;
  /** Local: Customs/SVH → EMOTORS HQ Warehouse */
  localTransportKgs: number;
  packagingCostKgs: number;
  insuranceKgs: number;
  customsKgs: number;
  bankFeesKgs: number;
  otherExpensesKgs: number;
};

export type ItemCostBreakdown = {
  procurementItemId: string;
  effectiveQuantity: number;
  totalWeightKg: number;
  factoryCostKgs: number;
  allocatedChinaShippingKgs: number;
  allocatedPackagingKgs: number;
  allocatedInternationalShippingKgs: number;
  allocatedLocalTransportKgs: number;
  allocatedInsuranceKgs: number;
  allocatedCustomsKgs: number;
  allocatedBankFeesKgs: number;
  allocatedOtherExpensesKgs: number;
  transportCostKgs: number;
  landedCostPerUnitKgs: number;
  totalLandedCostKgs: number;
  costPerUnitKgs: number;
  finalCostKgs: number;
  totalCostKgs: number;
  totalYuan: number;
};

export type LandedCostResult = {
  totalWeightKg: number;
  totalTransportCostKgs: number;
  totalYuan: number;
  totalCostKgs: number;
  totalLandedCostKgs: number;
  items: ItemCostBreakdown[];
  allocationMethod: import('@prisma/client').LandedCostAllocationMethod;
};

export function effectiveQuantity(item: ProcurementItemForAllocation): number {
  if (item.receivedQuantity != null && item.receivedQuantity > 0) return item.receivedQuantity;
  if (item.shippedQuantity != null && item.shippedQuantity > 0) return item.shippedQuantity;
  if (item.confirmedQuantity != null && item.confirmedQuantity > 0) return item.confirmedQuantity;
  return item.quantity;
}

export function itemTotalWeight(item: ProcurementItemForAllocation): number {
  return Number(item.weightKg) * effectiveQuantity(item);
}
