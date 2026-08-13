import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { formatKgs, formatKgsTableWhole } from './money';

describe('formatKgsTableWhole', () => {
  it('formats Общая сумма without decimal digits', () => {
    assert.equal(formatKgsTableWhole(125000), '125,000 KGS');
    assert.equal(formatKgsTableWhole('125000.00'), '125,000 KGS');
  });

  it('formats Оплачено without decimal digits', () => {
    assert.equal(formatKgsTableWhole(58500.5), '58,501 KGS');
    assert.equal(formatKgsTableWhole('58500.00'), '58,500 KGS');
  });

  it('formats Долг without decimal digits', () => {
    assert.equal(formatKgsTableWhole(66500.49), '66,500 KGS');
    assert.equal(formatKgsTableWhole('66500.00'), '66,500 KGS');
  });

  it('preserves thousand separators', () => {
    assert.equal(formatKgsTableWhole(1234567.89), '1,234,568 KGS');
  });

  it('does not change authoritative two-decimal formatter', () => {
    assert.equal(formatKgs(125000), '125000.00');
    assert.equal(formatKgs(125000.5), '125000.50');
  });
});

describe('sales list table money columns', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/page.tsx'),
    'utf8',
  );

  it('uses whole-number formatter only for table amount columns', () => {
    assert.match(pageSource, /formatKgsTableWhole\(sale\.totalAmount\)/);
    assert.match(pageSource, /formatKgsTableWhole\(sale\.paidAmount\)/);
    assert.match(pageSource, /formatKgsTableWhole\(sale\.debtAmount\)/);
    assert.doesNotMatch(pageSource, /formatKgs\(sale\.totalAmount\)/);
    assert.doesNotMatch(pageSource, /formatKgs\(sale\.paidAmount\)/);
    assert.doesNotMatch(pageSource, /formatKgs\(sale\.debtAmount\)/);
  });
});
