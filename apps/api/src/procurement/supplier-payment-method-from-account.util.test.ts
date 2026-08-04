import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProcurementSupplierPaymentMethod } from '@prisma/client';
import {
  resolveSupplierPaymentMethodFromAccountType,
  tryResolveSupplierPaymentMethodFromAccountType,
} from './supplier-payment-method-from-account.util';

describe('resolveSupplierPaymentMethodFromAccountType', () => {
  it('maps cash / cashbox types to CASH', () => {
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('CASH'),
      ProcurementSupplierPaymentMethod.CASH,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('PETTY_CASH'),
      ProcurementSupplierPaymentMethod.CASH,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('cashbox'),
      ProcurementSupplierPaymentMethod.CASH,
    );
  });

  it('maps bank types to BANK_ACCOUNT', () => {
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('BANK'),
      ProcurementSupplierPaymentMethod.BANK_ACCOUNT,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('DEPOSIT'),
      ProcurementSupplierPaymentMethod.BANK_ACCOUNT,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('BANK_ACCOUNT'),
      ProcurementSupplierPaymentMethod.BANK_ACCOUNT,
    );
  });

  it('maps QR types to QR_CODE', () => {
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('QR'),
      ProcurementSupplierPaymentMethod.QR_CODE,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('QR_ACCOUNT'),
      ProcurementSupplierPaymentMethod.QR_CODE,
    );
  });

  it('maps card / POS / acquiring types to BANK_CARD', () => {
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('POS'),
      ProcurementSupplierPaymentMethod.BANK_CARD,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('CARD'),
      ProcurementSupplierPaymentMethod.BANK_CARD,
    );
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('ACQUIRING_ACCOUNT'),
      ProcurementSupplierPaymentMethod.BANK_CARD,
    );
  });

  it('rejects unsupported account types', () => {
    assert.throws(
      () => resolveSupplierPaymentMethodFromAccountType('CREDIT_LINE'),
      (error: Error & { message?: string }) =>
        String(error?.message || '').includes(
          'Не удалось определить способ оплаты для выбранного счёта.',
        ),
    );
    assert.equal(tryResolveSupplierPaymentMethodFromAccountType('PAYROLL_ACCOUNT'), null);
    assert.equal(tryResolveSupplierPaymentMethodFromAccountType(null), null);
  });

  it('ignores mismatched client method conceptually by deriving only from account type', () => {
    // Client may send BANK_ACCOUNT while account is CASH — backend must use CASH.
    assert.equal(
      resolveSupplierPaymentMethodFromAccountType('CASH'),
      ProcurementSupplierPaymentMethod.CASH,
    );
  });
});
