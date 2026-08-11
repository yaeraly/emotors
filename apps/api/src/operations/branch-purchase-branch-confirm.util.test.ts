import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildBranchPurchaseConfirmDistributionLines,
  sumBranchPurchaseConfirmDistributionCostKgs,
  sumPersistedApprovedInventoryCostKgs,
} from './branch-purchase-branch-confirm.util';

describe('branch purchase branch confirm — no live FIFO at agreement', () => {
  const product = {
    id: 'prod-tra002',
    sku: 'TRA002',
    name: 'Transport item',
    finalCostKgs: 150,
  };

  const approvedItem = {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    quantity: 2,
    approvedQuantity: 2,
    lineStatus: 'APPROVED' as const,
    resolvedBranchPriceKgs: 500,
    approvedLineTotalKgs: 1000,
    totalAmount: 1000,
    estimatedUnitCost: 150,
    // Persisted at HQ Sales review — live FIFO preview may report Available: 0 here.
    estimatedLineProductCostKgs: 300,
    pricingPolicyVersionId: 'policy-1',
    pricingProfileId: null,
    appliedRuleType: null,
    appliedRuleId: null,
    appliedAdjustmentMode: null,
    appliedAdjustmentValue: null,
    priceResolvedAt: new Date('2026-01-01'),
  };

  it('PENDING_BRANCH_CONFIRMATION → confirm builds DO lines from persisted snapshots (TRA002, qty 2)', () => {
    const lines = buildBranchPurchaseConfirmDistributionLines(
      [approvedItem],
      new Map([[product.id, product]]),
      { branchType: 'FRANCHISE' },
    );

    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 2);
    assert.equal(lines[0].totalPrice, 1000);
    assert.equal(lines[0].totalCost, 300);
    assert.equal(lines[0].unitPrice, 500);
  });

  it('does not require live FIFO availability (no Insufficient FIFO stock path)', () => {
    // Regression: branch confirm must succeed when persisted cost exists even if
    // previewFifoAllocation would return allocatedQty = 0 for SKU TRA002.
    const lines = buildBranchPurchaseConfirmDistributionLines(
      [approvedItem],
      new Map([[product.id, product]]),
    );
    assert.equal(lines[0].sku, 'TRA002');
    assert.equal(sumPersistedApprovedInventoryCostKgs([approvedItem]), 300);
    assert.equal(sumBranchPurchaseConfirmDistributionCostKgs(lines), 300);
  });

  it('commercial totals unchanged — selling price stays HQ-approved snapshot', () => {
    const lines = buildBranchPurchaseConfirmDistributionLines(
      [approvedItem],
      new Map([[product.id, product]]),
    );
    assert.equal(lines[0].totalPrice, approvedItem.approvedLineTotalKgs);
    assert.notEqual(lines[0].totalPrice, lines[0].totalCost);
  });

  it('skips rejected/zero-approved lines', () => {
    const lines = buildBranchPurchaseConfirmDistributionLines(
      [
        approvedItem,
        {
          ...approvedItem,
          productId: 'prod-rejected',
          sku: 'REJ-1',
          approvedQuantity: 0,
          lineStatus: 'REJECTED',
        },
      ],
      new Map([[product.id, product]]),
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0].sku, 'TRA002');
  });

  it('HQ Warehouse fulfillment path still performs FIFO stock validation (not disabled globally)', () => {
    const distributionServicePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../distribution/distribution.service.ts',
    );
    const source = readFileSync(distributionServicePath, 'utf8');
    assert.ok(source.includes('Insufficient FIFO stock for SKU'));
    assert.ok(source.includes('previewFifoAllocation'));
  });
});
