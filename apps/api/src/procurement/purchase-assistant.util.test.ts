import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculatePurchaseRecommendation,
  normalizePeriodDays,
  normalizeReserveDays,
  prioritySortRank,
} from './purchase-assistant.util';

describe('calculatePurchaseRecommendation', () => {
  it('calculates recommendation from sales, branch orders, HQ stock and on-the-way', () => {
    const result = calculatePurchaseRecommendation({
      salesQuantity: 50,
      periodDays: 30,
      reserveDays: 10,
      hqAvailableQuantity: 10,
      onTheWayQuantity: 15,
      approvedBranchOrderQuantity: 20,
    });

    // requiredStock = ceil(50/30 * 10) = ceil(16.666) = 17
    // raw = 50 + 20 + 17 - 10 - 15 = 62
    assert.equal(result.requiredStock, 17);
    assert.equal(result.recommendedQuantity, 62);
    assert.equal(result.orderingRequired, true);
    assert.equal(result.priority, 'URGENT');
  });

  it('returns zero recommendation and sufficient priority when stock covers demand', () => {
    const result = calculatePurchaseRecommendation({
      salesQuantity: 10,
      periodDays: 30,
      reserveDays: 10,
      hqAvailableQuantity: 100,
      onTheWayQuantity: 20,
      approvedBranchOrderQuantity: 5,
    });
    assert.equal(result.recommendedQuantity, 0);
    assert.equal(result.orderingRequired, false);
    assert.equal(result.priority, 'SUFFICIENT');
  });

  it('clamps negative raw results to zero', () => {
    const result = calculatePurchaseRecommendation({
      salesQuantity: 5,
      periodDays: 30,
      reserveDays: 0,
      hqAvailableQuantity: 50,
      onTheWayQuantity: 10,
      approvedBranchOrderQuantity: 0,
    });
    assert.equal(result.recommendedQuantity, 0);
    assert.equal(result.orderingRequired, false);
  });

  it('changes recommendation when reserve days change', () => {
    const base = {
      salesQuantity: 60,
      periodDays: 30 as const,
      hqAvailableQuantity: 20,
      onTheWayQuantity: 0,
      approvedBranchOrderQuantity: 0,
    };
    const with10 = calculatePurchaseRecommendation({ ...base, reserveDays: 10 });
    const with20 = calculatePurchaseRecommendation({ ...base, reserveDays: 20 });
    assert.ok(with20.recommendedQuantity > with10.recommendedQuantity);
  });

  it('supports 30/60/90 analysis periods', () => {
    assert.equal(normalizePeriodDays(30), 30);
    assert.equal(normalizePeriodDays(60), 60);
    assert.equal(normalizePeriodDays(90), 90);
    assert.equal(normalizePeriodDays(15), 30);

    const sales60 = calculatePurchaseRecommendation({
      salesQuantity: 60,
      periodDays: 60,
      reserveDays: 10,
      hqAvailableQuantity: 0,
      onTheWayQuantity: 0,
      approvedBranchOrderQuantity: 0,
    });
    const sales30 = calculatePurchaseRecommendation({
      salesQuantity: 60,
      periodDays: 30,
      reserveDays: 10,
      hqAvailableQuantity: 0,
      onTheWayQuantity: 0,
      approvedBranchOrderQuantity: 0,
    });
    // Same sales over longer period → lower daily rate → lower required stock → lower recommendation
    assert.ok(sales60.recommendedQuantity < sales30.recommendedQuantity);
  });

  it('marks yellow recommended when HQ stock covers required reserve but order is still needed', () => {
    const result = calculatePurchaseRecommendation({
      salesQuantity: 30,
      periodDays: 30,
      reserveDays: 5,
      hqAvailableQuantity: 20,
      onTheWayQuantity: 0,
      approvedBranchOrderQuantity: 15,
    });
    // requiredStock = ceil(1*5)=5; raw = 30+15+5-20-0 = 30
    assert.equal(result.recommendedQuantity, 30);
    assert.equal(result.priority, 'RECOMMENDED');
  });

  it('normalizes reserve days', () => {
    assert.equal(normalizeReserveDays(undefined), 10);
    assert.equal(normalizeReserveDays(-3), 10);
    assert.equal(normalizeReserveDays(12.7), 12);
  });

  it('sorts urgent before recommended before sufficient', () => {
    assert.ok(prioritySortRank('URGENT') < prioritySortRank('RECOMMENDED'));
    assert.ok(prioritySortRank('RECOMMENDED') < prioritySortRank('SUFFICIENT'));
  });
});
