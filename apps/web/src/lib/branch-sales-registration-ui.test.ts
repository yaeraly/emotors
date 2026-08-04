import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { formatKgsTableWhole } from './money';
import { canFinalizeFullPaymentSale, shouldUseBranchCashierFullPaymentFlow } from './sale-full-payment';

const branchSalesManager = {
  id: 'bsm-1',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
  email: 'bsm@test.com',
  fullName: 'Branch Sales Manager',
};

const salesListPage = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/sales/page.tsx'),
  'utf8',
);
const registrationPage = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/sales/new/page.tsx'),
  'utf8',
);

describe('branch sales table money formatting', () => {
  it('displays whole-number amounts in sales table columns', () => {
    assert.match(salesListPage, /formatKgsTableWhole\(sale\.totalAmount\)/);
    assert.match(salesListPage, /formatKgsTableWhole\(sale\.paidAmount\)/);
    assert.match(salesListPage, /formatKgsTableWhole\(sale\.debtAmount\)/);
    assert.equal(formatKgsTableWhole(125_000.5), '125,001 KGS');
    assert.equal(formatKgsTableWhole('58500.00'), '58,500 KGS');
    assert.equal(formatKgsTableWhole(0), '0 KGS');
  });
});

describe('branch sales registration UI cleanup', () => {
  it('removes customer pricing summary texts', () => {
    assert.doesNotMatch(registrationPage, /sales\.customerSelected/);
    assert.doesNotMatch(registrationPage, /customers\.currentAdditionalMarkup/);
    assert.doesNotMatch(registrationPage, /sales\.appliedPriceType/);
  });

  it('hides duplicate page title for unified nav users', () => {
    assert.match(registrationPage, /usesUnifiedNavPageTitle/);
    assert.match(registrationPage, /showPageTitle/);
  });

  it('removes installment initial-payment method for branch sales manager', () => {
    assert.match(registrationPage, /!branchSalesManagerView \? \(/);
    assert.match(registrationPage, /sales\.downPaymentMethod/);
  });

  it('removes add payment method and save draft for branch sales manager', () => {
    assert.match(registrationPage, /!branchCashierHandoffFlow/);
    assert.match(registrationPage, /!branchSalesManagerView \? \(/);
    assert.doesNotMatch(
      registrationPage,
      /branchSalesManagerView \? null :[\s\S]*sales\.saveDraft/,
    );
  });

  it('keeps finalize and installment submit actions', () => {
    assert.match(registrationPage, /sales\.finalizeSale/);
    assert.match(registrationPage, /sales\.submitInstallmentRequest/);
  });
});

describe('branch sales full-payment finalize rules', () => {
  it('uses cashier handoff without sales-side payment validation', () => {
    assert.equal(shouldUseBranchCashierFullPaymentFlow(branchSalesManager), true);
    assert.equal(
      canFinalizeFullPaymentSale({
        user: branchSalesManager,
        paymentType: 'FULL_PAYMENT',
        totalAmount: 120_000,
        receivedAmount: 0,
        hasBlockingPriceError: false,
        hasMissingPricing: false,
        paymentValidationOk: false,
        paymentComplete: false,
      }),
      true,
    );
  });
});
