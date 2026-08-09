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

  it('localizes common units for HQ branch order display', () => {
    assert.equal(formatProductUnit('piece', 'ru'), 'шт.');
    assert.equal(formatProductUnit('piece', 'ky'), 'даана');
    assert.equal(formatProductUnit('piece', 'en'), 'pcs');
    assert.equal(formatProductUnit('kg', 'ru'), 'кг');
    assert.equal(formatProductUnit('kg', 'ky'), 'кг');
    assert.equal(formatProductUnit('kg', 'en'), 'kg');
    assert.equal(formatProductUnit('liter', 'ru'), 'л');
    assert.equal(formatProductUnit('liter', 'ky'), 'л');
    assert.equal(formatProductUnit('liter', 'en'), 'L');
    assert.equal(formatProductUnit('meter', 'ru'), 'м');
    assert.equal(formatProductUnit('meter', 'ky'), 'м');
    assert.equal(formatProductUnit('meter', 'en'), 'm');
  });

  it('falls back to readable raw unit for unknown values', () => {
    assert.equal(formatProductUnit('UNKNOWN_ENUM_CUSTOM', 'ru'), 'UNKNOWN_ENUM_CUSTOM');
    assert.equal(formatProductUnit('UNKNOWN_ENUM_CUSTOM', 'ky'), 'UNKNOWN_ENUM_CUSTOM');
    assert.equal(formatProductUnit('UNKNOWN_ENUM_CUSTOM', 'en'), 'UNKNOWN_ENUM_CUSTOM');
  });
});
