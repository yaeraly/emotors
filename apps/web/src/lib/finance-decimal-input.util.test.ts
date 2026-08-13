import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReconciliationDifference,
  isCompleteMoneyDecimal,
  normalizeMoneyInput,
  parseMoneyDecimal,
  previewReconciliationDifference,
  toEditableMoney,
} from './finance-decimal-input.util';

describe('finance-decimal-input.util', () => {
  it('accepts whole amounts while typing', () => {
    assert.equal(normalizeMoneyInput('0'), '0');
    assert.equal(normalizeMoneyInput('1'), '1');
    assert.equal(normalizeMoneyInput('25'), '25');
    assert.equal(normalizeMoneyInput('1500'), '1500');
    assert.equal(normalizeMoneyInput('98500'), '98500');
  });

  it('is not limited to 0-1', () => {
    assert.equal(normalizeMoneyInput('2'), '2');
    assert.equal(parseMoneyDecimal('1500'), 1500);
    assert.equal(parseMoneyDecimal('98500'), 98500);
  });

  it('supports decimals and preserves trailing separator while typing', () => {
    assert.equal(normalizeMoneyInput('100000.50'), '100000.50');
    assert.equal(normalizeMoneyInput('1.'), '1.');
    assert.equal(isCompleteMoneyDecimal('1.'), false);
    assert.equal(parseMoneyDecimal('1.'), null);
    assert.equal(parseMoneyDecimal('100000.50'), 100000.5);
  });

  it('strips spaces used as thousand separators', () => {
    assert.equal(normalizeMoneyInput('98 500'), '98500');
    assert.equal(parseMoneyDecimal('98 500'), 98500);
  });

  it('treats comma as thousands separator when appropriate', () => {
    assert.equal(normalizeMoneyInput('1,500'), '1500');
    assert.equal(normalizeMoneyInput('1,50'), '1.50');
    assert.equal(normalizeMoneyInput('100,000.50'), '100000.50');
  });

  it('keeps string state semantics and does not coerce empty input to zero', () => {
    assert.equal(normalizeMoneyInput(''), '');
    assert.equal(parseMoneyDecimal(''), null);
    assert.equal(previewReconciliationDifference('', 100000), null);
  });

  it('calculates difference preview only for complete values', () => {
    assert.equal(previewReconciliationDifference('98500', 100000), -1500);
    assert.equal(previewReconciliationDifference('102000', 100000), 2000);
    assert.equal(previewReconciliationDifference('1.', 100000), null);
  });

  it('formats initial editable money without undefined or NaN', () => {
    assert.equal(toEditableMoney(100000.5), '100000.5');
    assert.equal(toEditableMoney(null), '');
    assert.equal(toEditableMoney(undefined), '');
    assert.equal(toEditableMoney(Number.NaN), '');
  });

  it('supports middle-of-string edits without reformatting', () => {
    assert.equal(normalizeMoneyInput('18000'), '18000');
    assert.equal(normalizeMoneyInput('15000'), '15000');
  });

  it('parses submit values including zero', () => {
    assert.equal(parseMoneyDecimal('0'), 0);
    assert.equal(parseMoneyDecimal('1'), 1);
    assert.equal(calculateReconciliationDifference(98500, 100000), -1500);
  });
});
