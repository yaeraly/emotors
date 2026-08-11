import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  allBranchPurchaseAgreementLinesHaveInventoryCostSnapshot,
  buildBranchPurchaseCommercialAgreementLines,
  sumBranchPurchaseCommercialAgreementInventoryCostKgs,
  sumBranchPurchaseCommercialAgreementTotalKgs,
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
    const lines = buildBranchPurchaseCommercialAgreementLines(
      [approvedItem],
      new Map([[product.id, product]]),
      { branchType: 'FRANCHISE' },
    );

    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 2);
    assert.equal(lines[0].totalPrice, 1000);
    assert.equal(lines[0].totalCost, 300);
    assert.equal(lines[0].unitPrice, 500);
    assert.equal(lines[0].hasInventoryCostSnapshot, true);
  });

  it('does not require live FIFO availability (no Insufficient FIFO stock path)', () => {
    const lines = buildBranchPurchaseCommercialAgreementLines(
      [approvedItem],
      new Map([[product.id, product]]),
    );
    assert.equal(lines[0].sku, 'TRA002');
    assert.equal(sumPersistedApprovedInventoryCostKgs([approvedItem]), 300);
    assert.equal(sumBranchPurchaseCommercialAgreementInventoryCostKgs(lines), 300);
  });

  it('commercial totals unchanged — selling price stays HQ-approved snapshot', () => {
    const lines = buildBranchPurchaseCommercialAgreementLines(
      [approvedItem],
      new Map([[product.id, product]]),
    );
    assert.equal(lines[0].totalPrice, approvedItem.approvedLineTotalKgs);
    assert.notEqual(lines[0].totalPrice, lines[0].totalCost);
    assert.equal(sumBranchPurchaseCommercialAgreementTotalKgs(lines), 1000);
  });

  it('HQ Branch internal transfer profit is zero while amount unchanged', () => {
    const hqItem = {
      ...approvedItem,
      resolvedBranchPriceKgs: 36245.25,
      approvedLineTotalKgs: 72490.5,
      totalAmount: 72490.5,
      estimatedLineProductCostKgs: 63148.89,
      estimatedUnitCost: 31574.45,
    };
    const lines = buildBranchPurchaseCommercialAgreementLines(
      [hqItem],
      new Map([[product.id, product]]),
      { branchType: 'HQ_BRANCH' },
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0].totalPrice, 72490.5);
    assert.equal(lines[0].totalCost, 72490.5);
    assert.equal(lines[0].profit, 0);
  });

  it('missing estimatedLineProductCostKgs does not block branch agreement (TRA002 regression)', () => {
    const itemWithoutInventoryCost = {
      ...approvedItem,
      estimatedLineProductCostKgs: 0,
      estimatedUnitCost: 0,
    };
    const lines = buildBranchPurchaseCommercialAgreementLines(
      [itemWithoutInventoryCost],
      new Map([[product.id, product]]),
    );

    assert.equal(lines.length, 1);
    assert.equal(lines[0].totalPrice, 1000);
    assert.equal(lines[0].unitPrice, 500);
    assert.equal(lines[0].totalCost, 0);
    assert.equal(lines[0].unitCost, 0);
    assert.equal(lines[0].profit, 0);
    assert.equal(lines[0].hasInventoryCostSnapshot, false);
    assert.equal(allBranchPurchaseAgreementLinesHaveInventoryCostSnapshot(lines), false);
    assert.equal(sumBranchPurchaseCommercialAgreementInventoryCostKgs(lines), 0);
    assert.equal(sumBranchPurchaseCommercialAgreementTotalKgs(lines), 1000);
  });

  it('skips rejected/zero-approved lines', () => {
    const lines = buildBranchPurchaseCommercialAgreementLines(
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
