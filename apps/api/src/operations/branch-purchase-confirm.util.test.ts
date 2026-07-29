import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDistributionLinesFromConfirmedRequestItems } from './branch-purchase-confirm.util';

describe('buildDistributionLinesFromConfirmedRequestItems', () => {
  it('uses HQ-approved quantity and price without FIFO recalculation', () => {
    const product = {
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Motor',
      finalCostKgs: 55,
    };
    const lines = buildDistributionLinesFromConfirmedRequestItems(
      [
        {
          productId: 'prod-1',
          sku: 'SKU-1',
          productName: 'Motor',
          approvedQuantity: 4,
          resolvedBranchPriceKgs: 125,
          approvedLineTotalKgs: 500,
          estimatedUnitCost: 55,
          pricingPolicyVersionId: 'policy-1',
          pricingProfileId: null,
          appliedRuleType: null,
          appliedRuleId: null,
          appliedAdjustmentMode: null,
          appliedAdjustmentValue: null,
          priceResolvedAt: new Date('2026-01-01'),
        },
      ],
      new Map([[product.id, product]]),
    );

    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 4);
    assert.equal(lines[0].unitPrice, 125);
    assert.equal(lines[0].totalPrice, 500);
    assert.equal(lines[0].resolvedPriceKgs, 125);
  });

  it('skips rejected lines with zero approved quantity', () => {
    const product = {
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Motor',
      finalCostKgs: 55,
    };
    const lines = buildDistributionLinesFromConfirmedRequestItems(
      [
        {
          productId: 'prod-1',
          sku: 'SKU-1',
          productName: 'Motor',
          approvedQuantity: 0,
          resolvedBranchPriceKgs: 125,
          approvedLineTotalKgs: null,
          estimatedUnitCost: 55,
          pricingPolicyVersionId: null,
          pricingProfileId: null,
          appliedRuleType: null,
          appliedRuleId: null,
          appliedAdjustmentMode: null,
          appliedAdjustmentValue: null,
          priceResolvedAt: null,
        },
      ],
      new Map([[product.id, product]]),
    );

    assert.equal(lines.length, 0);
  });
});
