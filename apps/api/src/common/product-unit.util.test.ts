import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatProductUnitRu } from './product-unit.util';

describe('formatProductUnitRu', () => {
  it('maps common technical unit codes to Russian labels', () => {
    assert.equal(formatProductUnitRu('PCS'), 'шт.');
    assert.equal(formatProductUnitRu('PIECE'), 'шт.');
    assert.equal(formatProductUnitRu('UNIT'), 'шт.');
    assert.equal(formatProductUnitRu('SET'), 'комплект');
    assert.equal(formatProductUnitRu('PAIR'), 'пара');
    assert.equal(formatProductUnitRu('KG'), 'кг');
    assert.equal(formatProductUnitRu('KILOGRAM'), 'кг');
    assert.equal(formatProductUnitRu('METER'), 'м');
    assert.equal(formatProductUnitRu('LITER'), 'л');
    assert.equal(formatProductUnitRu('L'), 'л');
    assert.equal(formatProductUnitRu('BOX'), 'коробка');
    assert.equal(formatProductUnitRu('PACK'), 'упаковка');
    assert.equal(formatProductUnitRu('PACKAGE'), 'упаковка');
    assert.equal(formatProductUnitRu('ROLL'), 'рулон');
  });

  it('returns dash for empty or unknown units', () => {
    assert.equal(formatProductUnitRu(null), '—');
    assert.equal(formatProductUnitRu(''), '—');
    assert.equal(formatProductUnitRu('UNKNOWN_ENUM'), '—');
    assert.doesNotMatch(formatProductUnitRu('UNKNOWN_ENUM'), /UNKNOWN_ENUM/);
  });
});
