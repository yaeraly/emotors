import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  BRANCH_CASHIER_INSTALLMENT_PAYMENT_METHODS,
  branchCashierPaymentMethodLabelKey,
  buildReceivingAccountResolveQuery,
  filterBranchCashierTransferDestinationAccounts,
  formatBranchCashierAccountLabel,
  resolveBranchCashierTransferDestinationId,
} from './branch-cashier-receiving-account';

describe('branch cashier receiving account ui', () => {
  it('limits installment payment methods to cash, qr, and bank', () => {
    assert.deepEqual(BRANCH_CASHIER_INSTALLMENT_PAYMENT_METHODS, ['CASH', 'QR', 'BANK']);
  });

  it('maps payment methods to translated label keys', () => {
    assert.equal(branchCashierPaymentMethodLabelKey('CASH'), 'sales.paymentMethods.CASH');
    assert.equal(branchCashierPaymentMethodLabelKey('QR'), 'sales.paymentMethods.QR');
    assert.equal(branchCashierPaymentMethodLabelKey('BANK'), 'sales.paymentMethods.BANK_TRANSFER');
  });

  it('builds resolve query with installment id', () => {
    assert.equal(
      buildReceivingAccountResolveQuery('QR', 'inv-1'),
      '?paymentMethod=QR&installmentId=inv-1',
    );
  });

  it('formats transfer account labels as clean names only', () => {
    assert.equal(
      formatBranchCashierAccountLabel({ name: 'Kyzyl-Asker branch Cash account' }),
      'Kyzyl-Asker branch Cash account',
    );
    assert.equal(formatBranchCashierAccountLabel({ name: '  QR MBANK  ' }), 'QR MBANK');
  });

  it('excludes the selected source account from destination options', () => {
    const accounts = [
      { id: 'cash', name: 'Основная касса' },
      { id: 'qr', name: 'QR MBANK' },
      { id: 'bank', name: 'Банковский счет' },
    ];
    assert.deepEqual(
      filterBranchCashierTransferDestinationAccounts(accounts, 'cash').map((row) => row.id),
      ['qr', 'bank'],
    );
  });

  it('clears destination when it matches the new source account', () => {
    assert.equal(resolveBranchCashierTransferDestinationId('cash', 'cash'), '');
    assert.equal(resolveBranchCashierTransferDestinationId('qr', 'cash'), 'qr');
  });
});

describe('branch cashier installments actions and payment form', () => {
  const tableSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/branch-cashier/installments/page.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/branch-cashier/installments/[id]/page.tsx'),
    'utf8',
  );

  it('keeps only open action in the installments table', () => {
    assert.match(tableSource, /branchCashier\.actionOpenShort/);
    assert.doesNotMatch(tableSource, /actionPayShort/);
    assert.doesNotMatch(tableSource, /actionHistoryShort/);
    assert.doesNotMatch(tableSource, /acceptPayment/);
    assert.doesNotMatch(tableSource, /payment-history/);
  });

  it('keeps payment history inside the installment detail page', () => {
    assert.match(detailSource, /id="payment-history"/);
    assert.match(detailSource, /branchCashier\.paymentHistory/);
  });

  it('orders payment fields as amount, method, account, balance, notes', () => {
    const amountIndex = detailSource.indexOf("t('branchCashier.receivedAmount')");
    const methodIndex = detailSource.indexOf("t('distribution.paymentMethod')");
    const accountIndex = detailSource.indexOf("t('branchCashier.depositAccount')");
    const balanceIndex = detailSource.indexOf("t('branchCashier.accountBalance')");
    const notesIndex = detailSource.indexOf("t('crm.notes')");
    const submitIndex = detailSource.indexOf("t('distribution.submitPaymentCashier')");

    assert.ok(amountIndex >= 0);
    assert.ok(methodIndex > amountIndex);
    assert.ok(accountIndex > methodIndex);
    assert.ok(balanceIndex > accountIndex);
    assert.ok(notesIndex > balanceIndex);
    assert.ok(submitIndex > notesIndex);
  });

  it('uses read-only account resolution instead of manual account select', () => {
    assert.match(detailSource, /\/branch-cashier\/accounts\/resolve/);
    assert.doesNotMatch(detailSource, /<select[^>]*financeAccountId/);
    assert.doesNotMatch(detailSource, /setFinanceAccountId/);
    assert.match(detailSource, /formatAccountLabel\(resolvedAccount\)/);
  });
});
