import { Injectable } from '@nestjs/common';
import { LandedCostAllocationMethod, ProcurementOrderItem } from '@prisma/client';
import {
  effectiveQuantity,
  ItemCostBreakdown,
  LandedCostResult,
  OrderTransportCosts,
  ProcurementItemForAllocation,
} from './landed-cost.types';

@Injectable()
export class LandedCostEngineService {
  calculate(
    items: Array<ProcurementOrderItem | ProcurementItemForAllocation>,
    costs: OrderTransportCosts,
    allocationMethod: LandedCostAllocationMethod,
    trigger = 'AUTO',
  ): LandedCostResult {
    const normalizedItems: ProcurementItemForAllocation[] = items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      confirmedQuantity: item.confirmedQuantity,
      shippedQuantity: item.shippedQuantity,
      receivedQuantity: item.receivedQuantity,
      purchasePriceYuan: Number(item.purchasePriceYuan),
      yuanRate: Number(item.yuanRate),
      weightKg: Number(item.weightKg),
      manualAllocationKgs: item.manualAllocationKgs != null ? Number(item.manualAllocationKgs) : null,
    }));

    const totalWeightKg = this.round(
      normalizedItems.reduce((sum, item) => sum + Number(item.weightKg) * effectiveQuantity(item), 0),
      3,
    );

    const sharedCosts = {
      china: Number(costs.chinaLocalShippingKgs),
      packaging: Number(costs.packagingCostKgs),
      international: Number(costs.internationalShippingKgs),
      insurance: Number(costs.insuranceKgs),
      customs: Number(costs.customsKgs),
      bankFees: Number(costs.bankFeesKgs),
      other: Number(costs.otherExpensesKgs),
    };

    const totalTransportCostKgs = this.round(
      Object.values(sharedCosts).reduce((sum, value) => sum + value, 0),
      2,
    );

    const weights = this.buildAllocationWeights(normalizedItems, allocationMethod, totalWeightKg);

    const breakdowns: ItemCostBreakdown[] = normalizedItems.map((item, index) => {
      const qty = effectiveQuantity(item);
      const weight = Number(item.weightKg) * qty;
      const share = weights[index];
      const factoryCostKgs = this.round(item.purchasePriceYuan * item.yuanRate, 2);

      const allocatedChinaShippingKgs = this.round(sharedCosts.china * share, 2);
      const allocatedPackagingKgs = this.round(sharedCosts.packaging * share, 2);
      const allocatedInternationalShippingKgs = this.round(sharedCosts.international * share, 2);
      const allocatedInsuranceKgs = this.round(sharedCosts.insurance * share, 2);
      const allocatedCustomsKgs = this.round(sharedCosts.customs * share, 2);
      const allocatedBankFeesKgs = this.round(sharedCosts.bankFees * share, 2);
      const allocatedOtherExpensesKgs = this.round(sharedCosts.other * share, 2);

      const transportCostKgs = qty === 0
        ? 0
        : this.round(
            (allocatedChinaShippingKgs +
              allocatedPackagingKgs +
              allocatedInternationalShippingKgs +
              allocatedInsuranceKgs +
              allocatedCustomsKgs +
              allocatedBankFeesKgs +
              allocatedOtherExpensesKgs) /
              qty,
            2,
          );

      const landedCostPerUnitKgs = this.round(factoryCostKgs + transportCostKgs, 2);
      const totalLandedCostKgs = this.round(landedCostPerUnitKgs * qty, 2);
      const totalYuan = this.round(item.purchasePriceYuan * qty, 2);
      const totalCostKgs = totalLandedCostKgs;

      return {
        procurementItemId: item.id,
        effectiveQuantity: qty,
        totalWeightKg: this.round(weight, 3),
        factoryCostKgs,
        allocatedChinaShippingKgs,
        allocatedPackagingKgs,
        allocatedInternationalShippingKgs,
        allocatedInsuranceKgs,
        allocatedCustomsKgs,
        allocatedBankFeesKgs,
        allocatedOtherExpensesKgs,
        transportCostKgs,
        landedCostPerUnitKgs,
        totalLandedCostKgs,
        costPerUnitKgs: landedCostPerUnitKgs,
        finalCostKgs: landedCostPerUnitKgs,
        totalCostKgs,
        totalYuan,
      };
    });

    return {
      totalWeightKg,
      totalTransportCostKgs,
      totalYuan: this.round(breakdowns.reduce((sum, item) => sum + item.totalYuan, 0), 2),
      totalCostKgs: this.round(breakdowns.reduce((sum, item) => sum + item.totalCostKgs, 0), 2),
      totalLandedCostKgs: this.round(breakdowns.reduce((sum, item) => sum + item.totalLandedCostKgs, 0), 2),
      items: breakdowns,
      allocationMethod,
    };
  }

  private buildAllocationWeights(
    items: ProcurementItemForAllocation[],
    method: LandedCostAllocationMethod,
    totalWeightKg: number,
  ): number[] {
    if (!items.length) return [];

    if (method === LandedCostAllocationMethod.MANUAL) {
      const manualTotal = items.reduce((sum, item) => sum + Number(item.manualAllocationKgs ?? 0), 0);
      if (manualTotal > 0) {
        return items.map((item) => Number(item.manualAllocationKgs ?? 0) / manualTotal);
      }
      method = LandedCostAllocationMethod.BY_WEIGHT;
    }

    if (method === LandedCostAllocationMethod.BY_PURCHASE_COST) {
      const purchaseTotals = items.map((item) => {
        const qty = effectiveQuantity(item);
        return Number(item.purchasePriceYuan) * Number(item.yuanRate) * qty;
      });
      const totalPurchase = purchaseTotals.reduce((sum, value) => sum + value, 0);
      if (totalPurchase > 0) {
        return purchaseTotals.map((value) => value / totalPurchase);
      }
      method = LandedCostAllocationMethod.BY_WEIGHT;
    }

    if (method === LandedCostAllocationMethod.BY_CBM) {
      // CBM allocation reserved for future support; fall back to weight until CBM fields exist.
      method = LandedCostAllocationMethod.BY_WEIGHT;
    }

    const weights = items.map((item) => {
      const weight = Number(item.weightKg) * effectiveQuantity(item);
      return totalWeightKg > 0 ? weight / totalWeightKg : 1 / items.length;
    });

    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    return weightSum > 0 ? weights.map((value) => value / weightSum) : weights.map(() => 1 / items.length);
  }

  private round(value: number, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
}
