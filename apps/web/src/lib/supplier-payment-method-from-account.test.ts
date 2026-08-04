import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  deriveSupplierPaymentMethodFromAccountType,
  derivedSupplierPaymentMethodLabelKey,
} from './supplier-payment-method-from-account';

describe('HQ accountant derived supplier payment method', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const billsPage = readFileSync(join(root, 'app/finance/bills-to-pay/page.tsx'), 'utf8');
  const translations = readFileSync(join(root, 'i18n/translations.ts'), 'utf8');
  const workflow = readFileSync(
    join(root, '../../api/src/procurement/supplier-payment-workflow.service.ts'),
    'utf8',
  );

  it('removes payment-method dropdown from partial payment form', () => {
    assert.doesNotMatch(
      billsPage,
      /finance\.billsToPay\.paymentMethod[\s\S]{0,120}<select/,
    );
    assert.match(billsPage, /finance\.billsToPay\.accountOrCashbox/);
    assert.match(billsPage, /derivedSupplierPaymentMethodLabelKey/);
    assert.match(billsPage, /deriveSupplierPaymentMethodFromAccountType/);
  });

  it('maps cash / bank / QR account types for display', () => {
    assert.equal(deriveSupplierPaymentMethodFromAccountType('CASH'), 'CASH');
    assert.equal(deriveSupplierPaymentMethodFromAccountType('BANK'), 'BANK_ACCOUNT');
    assert.equal(deriveSupplierPaymentMethodFromAccountType('QR'), 'QR_CODE');
    assert.equal(deriveSupplierPaymentMethodFromAccountType(null), null);
    assert.equal(
      derivedSupplierPaymentMethodLabelKey(null),
      'finance.billsToPay.methodFromAccount.none',
    );
  });

  it('shows dash when no account is selected and updates with account type labels', () => {
    assert.match(translations, /finance\.billsToPay\.methodFromAccount\.none': '—'/);
    assert.match(translations, /finance\.billsToPay\.methodFromAccount\.CASH': 'Наличные'/);
    assert.match(translations, /finance\.billsToPay\.methodFromAccount\.BANK_ACCOUNT': 'Банковский счёт'/);
    assert.match(translations, /finance\.billsToPay\.methodFromAccount\.QR_CODE': 'QR'/);
  });

  it('does not send authoritative paymentMethod from the partial-payment payload', () => {
    assert.match(billsPage, /paymentMethod is intentionally omitted/);
    assert.doesNotMatch(
      billsPage,
      /return \{[\s\S]*paymentMethod:\s*paymentForm\.paymentMethod/,
    );
  });

  it('backend derives payment method from selected HQ account type', () => {
    assert.match(workflow, /resolveSupplierPaymentMethodFromAccountType/);
    assert.match(workflow, /SUPPLIER_PAYMENT_METHOD_DERIVED/);
    assert.match(workflow, /SUPPLIER_PARTIAL_PAYMENT_CREATED/);
    assert.match(workflow, /Client-provided paymentMethod is ignored/);
  });
});
