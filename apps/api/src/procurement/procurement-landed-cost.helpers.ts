import {
  LandedCostAllocationMethod,
  ProcurementAuditAction,
  ProcurementOrderStatus,
  ProcurementQuantityType,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { LandedCostEngineService } from './landed-cost/landed-cost-engine.service';
import { OrderTransportCosts } from './landed-cost/landed-cost.types';

export const PROCUREMENT_STATUS_CHANGE_ROLES: Role[] = [Role.CEO, Role.SUPPLY_CHAIN_MANAGER];

export const PROCUREMENT_FULL_MANAGE_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.PROCUREMENT_MANAGER,
  Role.SUPPLY_CHAIN_MANAGER,
];

export function userHasAnyRole(user: AuthUser, roles: Role[]) {
  const userRoles = user.roles?.length ? user.roles : [user.role];
  return roles.some((role) => userRoles.includes(role));
}

export function extractTransportCosts(order: OrderTransportCosts & { localTransportKgs?: number }) {
  return {
    chinaLocalShippingKgs: Number(order.chinaLocalShippingKgs ?? 0),
    internationalShippingKgs: Number(order.internationalShippingKgs ?? 0),
    localTransportKgs: Number(order.localTransportKgs ?? 0),
    packagingCostKgs: Number(order.packagingCostKgs ?? 0),
    insuranceKgs: Number(order.insuranceKgs ?? 0),
    customsKgs: Number(order.customsKgs ?? 0),
    bankFeesKgs: Number(order.bankFeesKgs ?? 0),
    otherExpensesKgs: Number(order.otherExpensesKgs ?? 0),
  };
}

export type ProcurementLandedCostDeps = {
  landedCostEngine: LandedCostEngineService;
  roundMoney: (value: number) => number;
  procurementOrderInclude: () => object;
};

export async function persistLandedCostRecalculation(
  tx: any,
  user: AuthUser | null,
  order: {
    id: string;
    allocationMethod: LandedCostAllocationMethod;
    chinaLocalShippingKgs: any;
    packagingCostKgs: any;
    internationalShippingKgs: any;
    localTransportKgs: any;
    insuranceKgs: any;
    customsKgs: any;
    bankFeesKgs: any;
    otherExpensesKgs: any;
    items: any[];
  },
  trigger: string,
  deps: ProcurementLandedCostDeps,
) {
  const costs = extractTransportCosts(order);
  const result = deps.landedCostEngine.calculate(order.items, costs, order.allocationMethod, trigger);

  for (const breakdown of result.items) {
    await tx.procurementOrderItem.update({
      where: { id: breakdown.procurementItemId },
      data: {
        totalWeightKg: breakdown.totalWeightKg,
        costKgs: breakdown.factoryCostKgs,
        factoryCostKgs: breakdown.factoryCostKgs,
        transportCostKgs: breakdown.transportCostKgs,
        finalCostKgs: breakdown.finalCostKgs,
        landedCostPerUnitKgs: breakdown.landedCostPerUnitKgs,
        totalLandedCostKgs: breakdown.totalLandedCostKgs,
        costPerUnitKgs: breakdown.costPerUnitKgs,
        totalCostKgs: breakdown.totalCostKgs,
        totalYuan: breakdown.totalYuan,
        allocatedChinaShippingKgs: breakdown.allocatedChinaShippingKgs,
        allocatedPackagingKgs: breakdown.allocatedPackagingKgs,
        allocatedInternationalShippingKgs: breakdown.allocatedInternationalShippingKgs,
        allocatedLocalTransportKgs: breakdown.allocatedLocalTransportKgs,
        allocatedInsuranceKgs: breakdown.allocatedInsuranceKgs,
        allocatedCustomsKgs: breakdown.allocatedCustomsKgs,
        allocatedBankFeesKgs: breakdown.allocatedBankFeesKgs,
        allocatedOtherExpensesKgs: breakdown.allocatedOtherExpensesKgs,
      },
    });
  }

  await tx.procurementOrder.update({
    where: { id: order.id },
    data: {
      totalWeightKg: result.totalWeightKg,
      totalTransportCostKgs: result.totalTransportCostKgs,
      totalYuan: result.totalYuan,
      totalCostKgs: result.totalCostKgs,
      lastRecalculatedAt: new Date(),
    },
  });

  await tx.procurementCostRecalculation.create({
    data: {
      procurementOrderId: order.id,
      allocationMethod: result.allocationMethod,
      trigger,
      totalWeightKg: result.totalWeightKg,
      totalLandedCostKgs: result.totalLandedCostKgs,
      snapshot: result,
      recalculatedById: user?.id,
    },
  });

  if (user) {
    await tx.procurementAuditEntry.create({
      data: {
        procurementOrderId: order.id,
        action: ProcurementAuditAction.COST_RECALCULATION,
        oldValue: null,
        newValue: { trigger, totalLandedCostKgs: result.totalLandedCostKgs },
        userId: user.id,
        userRole: user.role,
      },
    });
  }

  return result;
}

export function buildProcurementItemInput(
  item: any,
  product: { id: string; sku: string; name: string },
  supplierId: string,
  factoryId: string | undefined,
  roundMoney: (value: number) => number,
) {
  const quantity = Number(item.quantity ?? 0);
  const purchasePriceYuan = Number(item.purchasePriceYuan ?? 0);
  const yuanRate = Number(item.yuanRate ?? 0);
  const weightKg = Number(item.weightKg ?? 0);
  const costKgs = roundMoney(purchasePriceYuan * yuanRate);

  return {
    productId: product.id,
    supplierId: item.supplierId ?? supplierId,
    factoryId: item.factoryId ?? factoryId,
    sku: product.sku,
    productName: product.name,
    quantity,
    confirmedQuantity: item.confirmedQuantity != null ? Number(item.confirmedQuantity) : null,
    shippedQuantity: item.shippedQuantity != null ? Number(item.shippedQuantity) : null,
    receivedQuantity: item.receivedQuantity != null ? Number(item.receivedQuantity) : null,
    purchasePriceYuan,
    currency: item.currency ?? 'CNY',
    moq: item.moq != null ? Number(item.moq) : null,
    yuanRate,
    costKgs,
    weightKg,
    totalWeightKg: roundMoney(weightKg * quantity),
    transportCostKgs: Number(item.transportCostKgs ?? 0),
    finalCostKgs: roundMoney(costKgs + Number(item.transportCostKgs ?? 0)),
    totalYuan: roundMoney(quantity * purchasePriceYuan),
    totalCostKgs: roundMoney(quantity * roundMoney(costKgs + Number(item.transportCostKgs ?? 0))),
    factoryCostKgs: costKgs,
    landedCostPerUnitKgs: roundMoney(costKgs + Number(item.transportCostKgs ?? 0)),
    totalLandedCostKgs: roundMoney(quantity * roundMoney(costKgs + Number(item.transportCostKgs ?? 0))),
    costPerUnitKgs: roundMoney(costKgs + Number(item.transportCostKgs ?? 0)),
    estimatedArrivalDate: item.estimatedArrivalDate ? new Date(item.estimatedArrivalDate) : undefined,
    notes: item.notes,
    manualAllocationKgs: item.manualAllocationKgs != null ? Number(item.manualAllocationKgs) : null,
  };
}
