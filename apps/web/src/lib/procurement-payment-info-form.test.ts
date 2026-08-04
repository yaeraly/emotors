import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  EMPTY_SUPPLIER_ACCOUNT_FORM,
  controlledString,
  formForPaymentMethod,
  formFromPaymentInfoApi,
  normalizeSupplierAccountForm,
} from './procurement-payment-info-form';

describe('procurement payment info controlled form', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const paymentInfo = readFileSync(join(root, 'components/ProcurementPaymentInfo.tsx'), 'utf8');
  const supplierPayments = readFileSync(join(root, 'components/ProcurementSupplierPayments.tsx'), 'utf8');

  it('normalizes nullable API values to empty strings', () => {
    const form = formFromPaymentInfoApi({
      paymentMethod: 'BANK_ACCOUNT',
      bankName: null,
      accountHolder: undefined,
      accountNumber: null,
    });
    assert.equal(form.bankName, '');
    assert.equal(form.accountHolder, '');
    assert.equal(form.accountNumber, '');
    assert.equal(form.paymentMethod, 'BANK_ACCOUNT');
  });

  it('keeps accountNumber controlled across method switches', () => {
    const bank = normalizeSupplierAccountForm({
      paymentMethod: 'BANK_ACCOUNT',
      bankName: 'Demo Bank',
      accountHolder: 'Supplier',
      accountNumber: '123456',
    });
    const qr = formForPaymentMethod(bank, 'QR_CODE');
    assert.equal(qr.paymentMethod, 'QR_CODE');
    assert.equal(qr.accountNumber, '');
    assert.equal(qr.bankName, '');
    assert.equal(qr.accountHolder, '');

    const backToBank = formForPaymentMethod(qr, 'BANK_ACCOUNT');
    assert.equal(backToBank.paymentMethod, 'BANK_ACCOUNT');
    assert.equal(backToBank.accountNumber, '');
    assert.equal(typeof backToBank.accountNumber, 'string');
    assert.notEqual(backToBank.accountNumber, undefined);
    assert.notEqual(backToBank.accountNumber, null);
  });

  it('preserves typed bank fields when patching a single controlled value', () => {
    const previous = normalizeSupplierAccountForm({
      paymentMethod: 'BANK_ACCOUNT',
      bankName: 'ICBC',
      accountHolder: 'ACME',
      accountNumber: '999',
    });
    const next = normalizeSupplierAccountForm({ accountNumber: '888' }, previous);
    assert.equal(next.bankName, 'ICBC');
    assert.equal(next.accountHolder, 'ACME');
    assert.equal(next.accountNumber, '888');
  });

  it('never returns undefined/null for string fields from empty initial state', () => {
    const form = normalizeSupplierAccountForm(undefined, EMPTY_SUPPLIER_ACCOUNT_FORM);
    for (const key of ['bankName', 'accountHolder', 'accountNumber'] as const) {
      assert.equal(typeof form[key], 'string');
      assert.equal(form[key], '');
    }
  });

  it('controlledString coerces null/undefined/number safely', () => {
    assert.equal(controlledString(null), '');
    assert.equal(controlledString(undefined), '');
    assert.equal(controlledString(12.5), '12.5');
    assert.equal(controlledString('abc'), 'abc');
  });

  it('PaymentInfo inputs always bind value with string fallbacks', () => {
    assert.match(paymentInfo, /value=\{accountNumber\}/);
    assert.match(paymentInfo, /value=\{bankName\}/);
    assert.match(paymentInfo, /value=\{accountHolder\}/);
    assert.match(paymentInfo, /value=\{paymentMethod\}/);
    assert.match(paymentInfo, /const accountNumber = form\.accountNumber \?\? ''/);
    assert.match(paymentInfo, /formForPaymentMethod/);
    assert.match(paymentInfo, /formFromPaymentInfoApi/);
    assert.doesNotMatch(paymentInfo, /defaultValue=\{/);
  });

  it('supplier payments clears method-specific fields with controlled strings', () => {
    assert.match(supplierPayments, /setPaymentMethod/);
    assert.match(supplierPayments, /intendedFinanceAccountId \?\? ''/);
    assert.match(supplierPayments, /value=\{form\.accountNumber \?\? ''\}/);
    assert.match(supplierPayments, /value=\{confirmForm\.financeAccountId \?\? ''\}/);
    assert.match(supplierPayments, /value=\{confirmForm\.actualPaidKgs \?\? ''\}/);
    assert.match(supplierPayments, /normalizeSupplierAccountForm/);
  });

  it('draft payment load normalizes nullable payment fields', () => {
    assert.match(supplierPayments, /controlledString\(payment\.accountNumber\)/);
    assert.match(supplierPayments, /controlledString\(payment\.bankName\)/);
    assert.match(supplierPayments, /controlledString\(payment\.intendedFinanceAccountId\)/);
  });
});
