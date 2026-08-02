import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCustomerPriceListUnit,
  formatProductUnit,
} from './product-unit';

describe('formatCustomerPriceListUnit', () => {
  it('maps technical unit codes to Russian labels', () => {
    assert.equal(formatCustomerPriceListUnit('PCS'), 'шт.');
    assert.equal(formatCustomerPriceListUnit('PIECE'), 'шт.');
    assert.equal(formatCustomerPriceListUnit('SET'), 'комплект');
    assert.equal(formatCustomerPriceListUnit('PAIR'), 'пара');
    assert.equal(formatCustomerPriceListUnit('KG'), 'кг');
    assert.equal(formatCustomerPriceListUnit('METER'), 'м');
    assert.equal(formatCustomerPriceListUnit('LITER'), 'л');
  });

  it('returns dash for unknown units without exposing raw enum', () => {
    assert.equal(formatCustomerPriceListUnit('UNKNOWN_ENUM'), '—');
    assert.equal(formatCustomerPriceListUnit(null), '—');
  });
});

describe('formatProductUnit catalog behavior', () => {
  it('still shows raw unit in English catalog context for unknown values', () => {
    assert.equal(formatProductUnit('CUSTOM_UNIT', 'en'), 'CUSTOM_UNIT');
  });
});
