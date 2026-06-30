import { BadRequestException } from '@nestjs/common';
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

export const PRODUCT_WEIGHT_ERROR = 'Product weight is not configured.';

export function userHasAnyRole(user: AuthUser, roles: Role[]) {
  const userRoles = user.roles?.length ? user.roles : [user.role];
  return roles.some((role) => userRoles.includes(role));
}

export function assertProductWeightConfigured(product: { sku: string; name: string; weightKg: unknown }) {
  if (!product.weightKg || Number(product.weightKg) <= 0) {
    throw new BadRequestException(`${PRODUCT_WEIGHT_ERROR} (${product.sku} · ${product.name})`);
  }
}

export function resolveOrderExchangeRate(order: { exchangeRate?: unknown }, dto?: { exchangeRate?: unknown; yuanRate?: unknown }) {
  if (dto?.exchangeRate != null) return Number(dto.exchangeRate);
  if (dto?.yuanRate != null) return Number(dto.yuanRate);
  return Number(order.exchangeRate ?? 0);
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

export type ProductMasterData = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  weightKg: number;
  purchasePriceYuan: number;
  defaultSupplierId: string | null;
  defaultFactoryId: string | null;
  weightConfigured: boolean;
};

export function toProductMasterData(product: any): ProductMasterData {
  const weightKg = Number(product.weightKg ?? 0);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit ?? 'pcs',
    weightKg,
    purchasePriceYuan: Number(product.purchasePriceYuan ?? 0),
    defaultSupplierId: product.defaultSupplierId ?? null,
    defaultFactoryId: product.defaultFactoryId ?? null,
    weightConfigured: weightKg > 0,
  };
}

export async function syncOrderItemExchangeRates(tx: any, orderId: string, exchangeRate: number) {
  await tx.procurementOrderItem.updateMany({
    where: { orderId },
    data: { yuanRate: exchangeRate },
  });
}

export async function persistLandedCostRecalculation(
  tx: any,
  user: AuthUser | null,
  order: {
    id: string;
    exchangeRate?: unknown;
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
  const exchangeRate = Number(order.exchangeRate ?? 0);
  if (exchangeRate > 0) {
    await syncOrderItemExchangeRates(tx, order.id, exchangeRate);
  }

  const items = await tx.procurementOrderItem.findMany({ where: { orderId: order.id } });
  const costs = extractTransportCosts(order);
  const result = deps.landedCostEngine.calculate(items, costs, order.allocationMethod, trigger);

  for (const breakdown of result.items) {
    const item = items.find((entry: any) => entry.id === breakdown.procurementItemId);
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
        yuanRate: exchangeRate > 0 ? exchangeRate : item?.yuanRate,
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
        newValue: { trigger, totalLandedCostKgs: result.totalLandedCostKgs, shipmentWeightKg: result.totalWeightKg },
        userId: user.id,
        userRole: user.role,
      },
    });
  }

  return result;
}

export function buildProcurementItemInput(
  item: any,
  product: {
    id: string;
    sku: string;
    name: string;
    weightKg: unknown;
    unit?: string | null;
    defaultSupplierId?: string | null;
    defaultFactoryId?: string | null;
    purchasePriceYuan?: unknown;
  },
  supplierId: string,
  factoryId: string | undefined,
  exchangeRate: number,
  roundMoney: (value: number) => number,
) {
  assertProductWeightConfigured(product);

  const quantity = Number(item.quantity ?? 0);
  const purchasePriceYuan = Number(item.purchasePriceYuan ?? product.purchasePriceYuan ?? 0);
  const weightKg = Number(product.weightKg);
  const yuanRate = exchangeRate;
  const costKgs = roundMoney(purchasePriceYuan * yuanRate);
  const totalWeightKg = roundMoney(weightKg * quantity);

  return {
    productId: product.id,
    supplierId: item.supplierId ?? product.defaultSupplierId ?? supplierId,
    factoryId: item.factoryId ?? product.defaultFactoryId ?? factoryId,
    sku: product.sku,
    productName: product.name,
    unit: product.unit ?? 'pcs',
    quantity,
    confirmedQuantity: item.confirmedQuantity != null ? Number(item.confirmedQuantity) : null,
    shippedQuantity: item.shippedQuantity != null ? Number(item.shippedQuantity) : null,
    receivedQuantity: item.receivedQuantity != null ? Number(item.receivedQuantity) : null,
    purchasePriceYuan,
    currency: 'CNY',
    moq: item.moq != null ? Number(item.moq) : null,
    yuanRate,
    costKgs,
    weightKg,
    totalWeightKg,
    transportCostKgs: 0,
    finalCostKgs: costKgs,
    totalYuan: roundMoney(quantity * purchasePriceYuan),
    totalCostKgs: roundMoney(quantity * costKgs),
    factoryCostKgs: costKgs,
    landedCostPerUnitKgs: costKgs,
    totalLandedCostKgs: roundMoney(quantity * costKgs),
    costPerUnitKgs: costKgs,
    estimatedArrivalDate: item.estimatedArrivalDate ? new Date(item.estimatedArrivalDate) : undefined,
    notes: item.notes,
    manualAllocationKgs: item.manualAllocationKgs != null ? Number(item.manualAllocationKgs) : null,
  };
}

export { ProcurementAuditAction, ProcurementOrderStatus, ProcurementQuantityType };
