import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  BRANCH_SPLIT_PAYMENT_ERRORS,
  computeSplitRemaining,
  previewSplitCashierPayment,
} from './branch-cashier-split-payment';

describe('previewSplitCashierPayment', () => {
  it('splits full payment with cash change', () => {
    const result = previewSplitCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      cashAmount: '50000',
      qrAmount: '60000',
    });
    assert.ok(!('error' in result));
    assert.equal(result.qrNetAmount, 60_000);
    assert.equal(result.cashNetAmount, 40_000);
    assert.equal(result.cashChangeAmount, 10_000);
    assert.equal(result.totalNetAmount, 100_000);
  });

  it('accepts partial installment repayment split', () => {
    const result = previewSplitCashierPayment({
      payableAmount: 80_000,
      isFullPayment: false,
      cashAmount: '10000',
      qrAmount: '15000',
    });
    assert.ok(!('error' in result));
    assert.equal(result.totalNetAmount, 25_000);
    assert.equal(result.remainingAfterPayment, 55_000);
  });

  it('rejects qr above payable amount', () => {
    const result = previewSplitCashierPayment({
      payableAmount: 50_000,
      isFullPayment: true,
      cashAmount: '0',
      qrAmount: '60000',
    });
    assert.equal('error' in result && result.error, BRANCH_SPLIT_PAYMENT_ERRORS.QR_OVER_PAYABLE);
  });
});

describe('computeSplitRemaining', () => {
  it('never returns negative remaining', () => {
    assert.equal(computeSplitRemaining(100_000, 110_000), 0);
    assert.equal(computeSplitRemaining(100_000, 60_000), 40_000);
  });
});

describe('branch cashier invoices table and split payment form', () => {
  const tableSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/branch-cashier/invoices/page.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/branch-cashier/invoices/[id]/page.tsx'),
    'utf8',
  );

  it('shows actions column with open button', () => {
    assert.match(tableSource, /branchCashier\.colActions/);
    assert.match(tableSource, /branchCashier\.actionOpenShort/);
    assert.match(tableSource, /\/branch-cashier\/invoices\/\$\{invoice\.id\}/);
  });

  it('does not navigate on whole row click', () => {
    assert.doesNotMatch(tableSource, /onClick=\{\(\) => router\.push/);
  });

  it('renders split payment fields on invoice detail', () => {
    assert.match(detailSource, /branchCashier\.splitPayableAmount/);
    assert.match(detailSource, /branchCashier\.splitCashAmount/);
    assert.match(detailSource, /branchCashier\.splitQrAmount/);
    assert.match(detailSource, /branchCashier\.splitTotalEntered/);
    assert.match(detailSource, /branchCashier\.splitRemaining/);
    assert.match(detailSource, /cashAmount/);
    assert.match(detailSource, /qrAmount/);
  });

  it('uses read-only account resolution for cash and qr', () => {
    assert.match(detailSource, /\/branch-cashier\/accounts\/resolve/);
    assert.doesNotMatch(detailSource, /<select[^>]*financeAccountId/);
  });
});
