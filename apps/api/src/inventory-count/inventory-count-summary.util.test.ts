import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInventoryCountDiscrepancySummary } from './inventory-count-summary.util';

describe('buildInventoryCountDiscrepancySummary', () => {
  it('physical = system yields 0.00 KGS', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: 10, differenceQuantity: 0, differenceValueKgs: 0 },
    ]);
    assert.equal(summary.totalDifferenceValueKgs, 0);
    assert.equal(summary.matched, 1);
  });

  it('higher physical quantity creates positive surplus amount', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: 12, differenceQuantity: 2, differenceValueKgs: 12500 },
    ]);
    assert.equal(summary.totalDifferenceValueKgs, 12500);
    assert.equal(summary.overages, 1);
  });

  it('lower physical quantity creates negative shortage amount', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: 5, differenceQuantity: -3, differenceValueKgs: -8300 },
    ]);
    assert.equal(summary.totalDifferenceValueKgs, -8300);
    assert.equal(summary.shortages, 1);
  });

  it('multiple products are summed correctly', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: 12, differenceQuantity: 2, differenceValueKgs: 12500 },
      { actualQuantity: 5, differenceQuantity: -3, differenceValueKgs: -8300 },
      { actualQuantity: 1, differenceQuantity: 0, differenceValueKgs: 0 },
    ]);
    assert.equal(summary.totalDifferenceValueKgs, 4200);
    assert.equal(summary.overages, 1);
    assert.equal(summary.shortages, 1);
    assert.equal(summary.matched, 1);
  });

  it('positive and negative differences produce the correct net total', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: 11, differenceQuantity: 1, differenceValueKgs: 100.25 },
      { actualQuantity: 8, differenceQuantity: -2, differenceValueKgs: -50.1 },
    ]);
    assert.equal(summary.totalDifferenceValueKgs, 50.15);
  });

  it('uncounted lines do not affect monetary total until valued', () => {
    const summary = buildInventoryCountDiscrepancySummary([
      { actualQuantity: null, differenceQuantity: 0, differenceValueKgs: 0 },
      { actualQuantity: 9, differenceQuantity: -1, differenceValueKgs: -40 },
    ]);
    assert.equal(summary.remainingProducts, 1);
    assert.equal(summary.totalDifferenceValueKgs, -40);
  });
});
