import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  multiplyMoney,
  pricesDiffer,
  sumMoney,
  validateSalePriceRange,
} from './sale-price-range.util';

describe('sale price range validation', () => {
  const limits = {
    authoritativeMinimumPrice: 1000,
    authoritativeMaximumPrice: 1400,
  };

  it('accepts minimum price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 1000 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.salePrice, 1000);
  });

  it('accepts price between minimum and maximum', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 1150 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.salePrice, 1150);
  });

  it('accepts recommended price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 1200 });
    assert.equal(result.ok, true);
  });

  it('accepts maximum price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 1400 });
    assert.equal(result.ok, true);
  });

  it('rejects price below minimum', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 999 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'BELOW_MINIMUM');
      assert.match(result.message, /ниже минимальной цены: 1000/);
    }
  });

  it('rejects price above maximum', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 1401 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'ABOVE_MAXIMUM');
      assert.match(result.message, /выше максимальной цены: 1400/);
    }
  });

  it('rejects empty price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: '' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'EMPTY');
  });

  it('rejects negative price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: -10 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'NEGATIVE');
  });

  it('rejects invalid numeric price', () => {
    const result = validateSalePriceRange({ ...limits, requestedSalePrice: 'abc' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'INVALID_NUMBER');
  });

  it('rejects zero when zero-price sales are not permitted', () => {
    const result = validateSalePriceRange({
      ...limits,
      requestedSalePrice: 0,
      allowZeroPrice: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'ZERO_NOT_ALLOWED');
  });

  it('does not trust frontend-provided limits by only using authoritative values', () => {
    const result = validateSalePriceRange({
      requestedSalePrice: 900,
      authoritativeMinimumPrice: 1000,
      authoritativeMaximumPrice: 1400,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.minimumPrice, 1000);
  });

  it('calculates line and sale totals with Decimal money helpers', () => {
    assert.equal(multiplyMoney(1150, 3), 3450);
    assert.equal(sumMoney([1150, 1400, 1000]), 3550);
  });

  it('detects manual price change from recommended', () => {
    assert.equal(pricesDiffer(1200, 1150), true);
    assert.equal(pricesDiffer(1200, 1200), false);
  });
});
