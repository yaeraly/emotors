import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canViewProductCost,
  isHqSalesManagerScopedUser,
} from './rbac';
import {
  presentBranchPurchaseRequestForUser,
  stripBranchPurchaseRequestCostFields,
} from '../operations/branch-purchase-request.presenter';
import { sanitizeDistributionOrderForBranchCeo } from '../distribution/branch-ceo-distribution.presenter';
import { BranchPurchaseRequestStatus } from '@prisma/client';

describe('hq-sales-financial-privacy', () => {
  it('HQ Sales Manager scoped user cannot view product cost', () => {
    const user = { role: Role.HQ_SALES_MANAGER, roles: [Role.HQ_SALES_MANAGER], branchId: null, permissions: [] };
    assert.equal(isHqSalesManagerScopedUser(user), true);
    assert.equal(canViewProductCost(user), false);
  });

  it('HQ CEO still sees financial information', () => {
    const user = { role: Role.CEO, roles: [Role.CEO], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
  });

  it('HQ Finance permissions remain unchanged', () => {
    const user = { role: Role.FINANCE_MANAGER, roles: [Role.FINANCE_MANAGER], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
  });

  it('HQ Accountant permissions remain unchanged', () => {
    const user = { role: Role.HQ_ACCOUNTANT, roles: [Role.HQ_ACCOUNTANT], branchId: null, permissions: [] };
    assert.equal(canViewProductCost(user), true);
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
