import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canViewProcurement,
  canViewProductCost,
  canViewPricing,
  isHqSalesManagerScopedUser,
} from './rbac';
import {
  assertHqSalesCannotAccessProcurementData,
  stripConfidentialCommercialFields,
  sanitizeBranchDashboardForRestrictedFinancialView,
  sanitizeHqB2bSaleForRestrictedFinancialView,
} from './hq-sales-procurement-privacy.util';
import {
  presentBranchPurchaseRequestForUser,
  stripBranchPurchaseRequestCostFields,
} from '../operations/branch-purchase-request.presenter';
import { sanitizeDistributionOrderForBranchCeo } from '../distribution/branch-ceo-distribution.presenter';
import { BranchPurchaseRequestStatus } from '@prisma/client';

describe('hq-sales-financial-privacy', () => {
  const hqSales = { role: Role.HQ_SALES_MANAGER, roles: [Role.HQ_SALES_MANAGER], branchId: null, permissions: [] };

  it('HQ Sales Manager scoped user cannot view product cost', () => {
    assert.equal(isHqSalesManagerScopedUser(hqSales), true);
    assert.equal(canViewProductCost(hqSales), false);
  });

  it('HQ Sales cannot view procurement or pricing APIs', () => {
    assert.equal(canViewProcurement(hqSales), false);
    assert.equal(canViewPricing(hqSales), false);
  });

  it('procurement data assert throws for HQ Sales', () => {
    assert.throws(() => assertHqSalesCannotAccessProcurementData(hqSales), /Forbidden/);
  });

  it('HQ CEO still sees financial information', () => {
    const user = { role: Role.CEO, roles: [Role.CEO], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
    assert.equal(canViewProcurement(user), true);
    assert.equal(canViewPricing(user), true);
  });

  it('Supply Manager retains procurement visibility', () => {
    const user = {
      role: Role.SUPPLY_CHAIN_MANAGER,
      roles: [Role.SUPPLY_CHAIN_MANAGER],
      branchId: null,
      permissions: ['procurement.view', 'procurement.manage'],
    };
    assert.equal(canViewProcurement(user), true);
    assert.equal(canViewProductCost(user), true);
  });

  it('HQ Finance permissions remain unchanged', () => {
    const user = { role: Role.FINANCE_MANAGER, roles: [Role.FINANCE_MANAGER], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
    assert.equal(canViewPricing(user), true);
  });

  it('HQ Accountant permissions remain unchanged', () => {
    const user = { role: Role.HQ_ACCOUNTANT, roles: [Role.HQ_ACCOUNTANT], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
    assert.equal(canViewPricing(user), true);
  });

  it('strips supplier, factory, and price history from product payloads', () => {
    const stripped = stripConfidentialCommercialFields({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Product',
      purchasePriceYuan: 100,
      finalCostKgs: 500,
      marginAmount: 50,
      marginPercent: 10,
      defaultSupplier: { id: 's1', name: 'Supplier' },
      defaultFactory: { id: 'f1', name: 'Factory' },
      priceHistory: [{ finalCostKgs: 400, sellingPriceKgs: 600 }],
      purchasePriceHistory: [{ newPriceYuan: 90 }],
      sellingPriceKgs: 600,
    });
    assert.equal(stripped.purchasePriceYuan, undefined);
    assert.equal(stripped.finalCostKgs, undefined);
    assert.equal(stripped.defaultSupplier, undefined);
    assert.equal(stripped.defaultFactory, undefined);
    assert.equal(stripped.priceHistory, undefined);
    assert.equal(stripped.purchasePriceHistory, undefined);
    assert.equal(stripped.sku, 'SKU-1');
    assert.equal(stripped.sellingPriceKgs, 600);
  });

  it('sanitizes HQ B2B sale items without cost snapshots', () => {
    const sanitized = sanitizeHqB2bSaleForRestrictedFinancialView({
      id: 'sale-1',
      totalAmount: 1000,
      items: [
        {
          id: 'line-1',
          unitPrice: 500,
          lineTotal: 1000,
          costPriceSnapshot: 300,
          basePriceSnapshot: 400,
          pricingSource: 'POLICY',
        },
      ],
    });
    assert.equal(sanitized.totalAmount, 1000);
    const line = (sanitized.items as Array<Record<string, unknown>>)[0];
    assert.equal(line.unitPrice, 500);
    assert.equal(line.lineTotal, 1000);
    assert.equal(line.costPriceSnapshot, undefined);
    assert.equal(line.basePriceSnapshot, undefined);
    assert.equal(line.pricingSource, undefined);
  });

  it('sanitizes branch dashboard without profit or inventory valuation', () => {
    const sanitized = sanitizeBranchDashboardForRestrictedFinancialView({
      customerCount: 10,
      totalSales: 50000,
      totalProfit: 12000,
      debtAmount: 1000,
      inventoryQuantity: 200,
      inventoryValue: 80000,
      lowStockCount: 3,
    });
    assert.equal(sanitized.totalSales, 50000);
    assert.equal(sanitized.debtAmount, 1000);
    assert.equal(sanitized.totalProfit, undefined);
    assert.equal(sanitized.inventoryValue, undefined);
    assert.equal(sanitized.inventoryQuantity, 200);
  });

  it('strips branch purchase request cost fields for HQ Sales presentation', () => {
    const request = {
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      totalEstimatedAmount: 5000,
      totalProductCostKgs: 4200,
      authoritativeTransferCostKgs: 4200,
      transportCostKgs: 100,
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          sku: 'SKU-1',
          productName: 'Product',
          quantity: 2,
          wholesalePriceKgs: 2500,
          resolvedBranchPriceKgs: 2500,
          estimatedUnitCost: 2100,
          estimatedLineProductCostKgs: 4200,
          transportExpenseAllocation: 50,
          totalAmount: 5000,
        },
      ],
    };

    const presented = presentBranchPurchaseRequestForUser(request, {
      hideSensitive: false,
      hideFinancialCost: true,
    });

    assert.equal(presented.totalProductCostKgs, undefined);
    assert.equal(presented.authoritativeTransferCostKgs, undefined);
    assert.equal(presented.transportCostKgs, undefined);
    assert.equal(presented.totalEstimatedAmount, 5000);
    const item = presented.items[0] as Record<string, unknown>;
    assert.equal(item.estimatedUnitCost, undefined);
    assert.equal(item.estimatedLineProductCostKgs, undefined);
    assert.equal(item.transportExpenseAllocation, undefined);
    assert.equal(item.wholesalePriceKgs, 2500);
    assert.equal(item.resolvedBranchPriceKgs, 2500);
    assert.equal(item.totalAmount, 5000);
  });

  it('stripBranchPurchaseRequestCostFields removes FIFO and landed cost fields', () => {
    const stripped = stripBranchPurchaseRequestCostFields({
      totalProductCostKgs: 100,
      items: [{ estimatedUnitCost: 10, estimatedLineProductCostKgs: 100 }],
    });
    assert.equal(stripped.totalProductCostKgs, undefined);
    assert.equal((stripped.items[0] as Record<string, unknown>).estimatedLineProductCostKgs, undefined);
  });

  it('distribution order sanitizer removes profit and unit cost', () => {
    const sanitized = sanitizeDistributionOrderForBranchCeo({
      totalAmount: 1000,
      totalCost: 700,
      totalProfit: 300,
      items: [
        {
          id: 'line-1',
          sku: 'SKU',
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000,
          unitCost: 700,
          profit: 300,
          landedUnitCostKgs: 750,
        },
      ],
    });
    assert.equal(sanitized.totalAmount, 1000);
    assert.equal(sanitized.totalCost, undefined);
    assert.equal(sanitized.totalProfit, undefined);
    const line = sanitized.items?.[0] as Record<string, unknown>;
    assert.equal(line.unitCost, undefined);
    assert.equal(line.profit, undefined);
    assert.equal(line.unitPrice, 1000);
  });
});
