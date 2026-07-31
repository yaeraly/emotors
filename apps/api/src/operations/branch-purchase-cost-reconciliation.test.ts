import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildDistributionLinesFromConfirmedRequestItems } from './branch-purchase-confirm.util';
import { sumBranchPurchaseLineProductCosts } from './branch-purchase-fifo-cost.util';
import { buildFifoAllocationLines } from '../pricing/pricing-fifo-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

const CHINA_BATCH_TOTAL = 914369.8;

function buildChinaBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL);
  return lineTotals.map((totalCostKgs, index) => ({
    batchId: `batch-${index}`,
    sku: `SKU-${index}`,
    totalCostKgs,
    quantity,
  }));
}

describe('buildDistributionLinesFromConfirmedRequestItems — authoritative FIFO costs', () => {
  const product = {
    id: 'prod-1',
    sku: 'SKU-1',
    name: 'Motor',
    finalCostKgs: 55,
  };

  it('uses estimatedLineProductCostKgs instead of unit×qty', () => {
    const authoritativeLineCost = 162317.33;
    const lines = buildDistributionLinesFromConfirmedRequestItems(
      [
        {
          productId: 'prod-1',
          sku: 'SKU-1',
          productName: 'Motor',
          approvedQuantity: 11,
          resolvedBranchPriceKgs: 125,
          approvedLineTotalKgs: 1375,
          estimatedUnitCost: 14756.12,
          estimatedLineProductCostKgs: authoritativeLineCost,
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

    assert.equal(lines[0].totalCost, authoritativeLineCost);
    assert.notEqual(lines[0].totalCost, roundDisplayMoney(lines[0].unitCost * 11));
  });

  it('preserves HQ-approved selling price totals', () => {
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
          estimatedLineProductCostKgs: 220,
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
    assert.equal(lines[0].totalPrice, 500);
    assert.equal(lines[0].resolvedPriceKgs, 125);
  });
});

describe('BPR China batch transfer parity', () => {
  const procurementLines = buildChinaBatchLines();

  it('full shipment line-sum equals 914369.80', () => {
    const bprLineCosts = procurementLines.map((line) => {
      const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
      const allocation = buildFifoAllocationLines(
        [
          {
            batchId: line.batchId,
            remainingQuantity: line.quantity,
            unitCostKgs: unit,
            layerTotalCostKgs: line.totalCostKgs,
            layerBaseQuantity: line.quantity,
          },
        ],
        line.quantity,
        { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
      );
      return allocation.totalCostKgs;
    });

    const total = sumBranchPurchaseLineProductCosts(bprLineCosts);
    assert.equal(total, CHINA_BATCH_TOTAL);

    const distributionLines = buildDistributionLinesFromConfirmedRequestItems(
      procurementLines.map((line, index) => ({
        productId: `prod-${index}`,
        sku: line.sku,
        productName: line.sku,
        approvedQuantity: line.quantity,
        resolvedBranchPriceKgs: 100,
        approvedLineTotalKgs: line.quantity * 100,
        estimatedUnitCost: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        estimatedLineProductCostKgs: line.totalCostKgs,
        pricingPolicyVersionId: null,
        pricingProfileId: null,
        appliedRuleType: null,
        appliedRuleId: null,
        appliedAdjustmentMode: null,
        appliedAdjustmentValue: null,
        priceResolvedAt: null,
      })),
      new Map(
        procurementLines.map((line, index) => [
          `prod-${index}`,
          {
            id: `prod-${index}`,
            sku: line.sku,
            name: line.sku,
            finalCostKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
          },
        ]),
      ),
    );

    const distributionTotal = sumDisplayMoneyTotals(distributionLines.map((line) => line.totalCost));
    assert.equal(distributionTotal, CHINA_BATCH_TOTAL);

    const unitTimesQtyTotal = roundDisplayMoney(
      procurementLines.reduce((sum, line) => {
        const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
        return sum + unit * line.quantity;
      }, 0),
    );
    assert.notEqual(distributionTotal, unitTimesQtyTotal);
  });

  it('documents 0.82 KGS drift when lines use rounded unit×qty instead of authoritative totals', () => {
    const procurementLines = buildChinaBatchLines();
    const authoritative = sumDisplayMoneyTotals(procurementLines.map((line) => line.totalCostKgs));
    const roundedUnitLineSum = roundDisplayMoney(
      procurementLines.reduce((sum, line) => {
        const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
        return sum + roundDisplayMoney(unit * line.quantity);
      }, 0),
    );
    const drift = roundDisplayMoney(authoritative - roundedUnitLineSum);
    assert.equal(authoritative, CHINA_BATCH_TOTAL);
    assert.ok(Math.abs(drift) > 0);
    // Production BPR-1785478341861 observed total 914368.98 vs shipment 914369.80 (−0.82 KGS).
    assert.equal(roundDisplayMoney(CHINA_BATCH_TOTAL - 914368.98), 0.82);
  });
});
