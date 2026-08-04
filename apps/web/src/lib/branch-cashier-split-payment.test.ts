import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  addPaymentMethodRow,
  availablePaymentMethods,
  BRANCH_MULTI_METHOD_PAYMENT_ERRORS,
  canAddPaymentMethod,
  computePaymentRemaining,
  createInitialPaymentRows,
  createPaymentMethodRow,
  previewMultiMethodCashierPayment,
  removePaymentMethodRow,
} from './branch-cashier-multi-method-payment';

describe('branch cashier multi-method payment ui helpers', () => {
  it('starts with one cash row', () => {
    const rows = createInitialPaymentRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.method, 'CASH');
  });

  it('adds unused payment methods only', () => {
    let rows = createInitialPaymentRows();
    rows = addPaymentMethodRow(rows);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.method), ['CASH', 'QR']);
    rows = addPaymentMethodRow(rows);
    assert.deepEqual(rows.map((row) => row.method), ['CASH', 'QR', 'BANK']);
    assert.equal(canAddPaymentMethod(rows), false);
  });

  it('prevents duplicate methods in available list', () => {
    const rows = [
      createPaymentMethodRow('CASH', '0'),
      createPaymentMethodRow('QR', '0'),
    ];
    assert.deepEqual(availablePaymentMethods(rows), ['BANK']);
    assert.deepEqual(new Set(availablePaymentMethods(rows, 'CASH')), new Set(['BANK', 'CASH']));
  });

  it('removes rows but keeps at least one', () => {
    const rows = [
      createPaymentMethodRow('CASH', '1000'),
      createPaymentMethodRow('QR', '0'),
    ];
    const afterRemove = removePaymentMethodRow(rows, rows[1]!.id);
    assert.equal(afterRemove.length, 1);
    assert.equal(removePaymentMethodRow(afterRemove, afterRemove[0]!.id).length, 1);
  });
});

describe('previewMultiMethodCashierPayment', () => {
  it('supports cash + qr + bank full payment preview', () => {
    const result = previewMultiMethodCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      rows: [
        createPaymentMethodRow('CASH', '20000'),
        createPaymentMethodRow('QR', '30000'),
        createPaymentMethodRow('BANK', '50000'),
      ],
    });
    assert.ok(!('error' in result));
    assert.equal(result.totalNetAmount, 100_000);
  });

  it('rejects non-cash overpayment', () => {
    const result = previewMultiMethodCashierPayment({
      payableAmount: 50_000,
      isFullPayment: true,
      rows: [
        createPaymentMethodRow('QR', '30000'),
        createPaymentMethodRow('BANK', '30000'),
      ],
    });
    assert.equal(
      'error' in result && result.error,
      BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NON_CASH_OVER_PAYABLE,
    );
  });
});

describe('computePaymentRemaining', () => {
  it('never returns negative remaining', () => {
    assert.equal(computePaymentRemaining(100_000, 110_000), 0);
    assert.equal(computePaymentRemaining(100_000, 60_000), 40_000);
  });
});

describe('branch cashier invoices table and multi-method payment form', () => {
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

  it('renders multi-method payment section on invoice detail', () => {
    assert.match(detailSource, /branchCashier\.splitPayableAmount/);
    assert.match(detailSource, /branchCashier\.paymentMethodsSection/);
    assert.match(detailSource, /branchCashier\.addPaymentMethod/);
    assert.match(detailSource, /branchCashier\.splitTotalEntered/);
    assert.match(detailSource, /branchCashier\.splitRemaining/);
    assert.match(detailSource, /allocations/);
  });

  it('uses read-only account resolution without manual account select', () => {
    assert.match(detailSource, /\/branch-cashier\/accounts\/resolve/);
    assert.doesNotMatch(detailSource, /<select[^>]*financeAccountId/);
  });

  it('posts payment to invoice id from route param, not sale id', () => {
    assert.match(detailSource, /useParams<\{ id: string \}>\(\)/);
    assert.match(detailSource, /\/branch-cashier\/invoices\/\$\{id\}\/payments/);
    assert.match(detailSource, /\/branch-cashier\/invoices\/\$\{id\}`/);
    assert.doesNotMatch(detailSource, /saleId/);
    assert.doesNotMatch(detailSource, /receiptNumber/);
  });

  it('disables submit while payment is in flight', () => {
    assert.match(detailSource, /disabled=\{!canSubmit\}/);
    assert.match(detailSource, /setSubmitting\(true\)/);
    assert.match(detailSource, /idempotencyKey/);
  });
});
