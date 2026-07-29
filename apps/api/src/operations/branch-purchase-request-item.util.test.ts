import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toBranchPurchaseRequestItemCreate } from './branch-purchase-request-item.util';
import {
  assertBranchPurchaseBranchContext,
  assertBranchPurchaseRequestItems,
} from './branch-purchase-request.validation';

describe('toBranchPurchaseRequestItemCreate', () => {
  it('maps resolved line fields to Prisma create input', () => {
    const input = toBranchPurchaseRequestItemCreate({
      productId: 'prod-1',
      sku: 'SKU-1',
      productName: 'Motor',
      quantity: 3,
      unit: 'pcs',
      currentBranchStock: 1,
      hqAvailableStock: 10,
      hqPhysicalStock: 12,
      wholesalePriceKgs: 100,
      resolvedBranchPriceKgs: 120,
      pricingPolicyVersionId: 'policy-1',
      pricingProfileId: 'profile-1',
      appliedRuleType: null,
      appliedRuleId: null,
      appliedAdjustmentMode: null,
      appliedAdjustmentValue: null,
      priceResolvedAt: null,
      hasPricingPolicyAtSubmit: true,
      weightKg: 2.5,
      transportExpenseAllocation: 0,
      estimatedUnitCost: 90,
      estimatedLineProductCostKgs: 270,
      totalAmount: 360,
      note: 'test',
    });

    assert.equal(input.productId, 'prod-1');
    assert.equal(input.quantity, 3);
    assert.equal(input.estimatedLineProductCostKgs, 270);
    assert.equal(input.note, 'test');
  });
});

describe('branch purchase request validation', () => {
  it('requires branch context', () => {
    assert.throws(
      () => assertBranchPurchaseBranchContext(null),
      /Branch context is required/i,
    );
  });

  it('requires at least one product line', () => {
    assert.throws(() => assertBranchPurchaseRequestItems([]), /At least one product line/i);
  });

  it('rejects non-positive quantity', () => {
    assert.throws(
      () => assertBranchPurchaseRequestItems([{ productId: 'p1', quantity: 0 }]),
      /positive number/i,
    );
  });

  it('accepts valid items', () => {
    assertBranchPurchaseRequestItems([{ productId: 'p1', quantity: 2 }]);
  });
});
