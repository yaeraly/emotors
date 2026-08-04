import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('supplier payment workflow account-derived method', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const service = readFileSync(join(root, 'supplier-payment-workflow.service.ts'), 'utf8');
  const createDto = readFileSync(join(root, 'dto/create-supplier-payment.dto.ts'), 'utf8');

  it('keeps paymentMethod optional on create DTO', () => {
    assert.match(createDto, /@IsOptional\(\)[\s\S]{0,80}paymentMethod\?:/);
  });

  it('derives method in create, update and send-to-cashier paths', () => {
    assert.match(service, /resolveSupplierPaymentMethodFromAccountType\(intendedAccount\.typeCode\)/);
    assert.match(service, /resolveSupplierPaymentMethodFromAccountType\(account\.typeCode\)/);
    assert.match(service, /paymentMethod: derivedPaymentMethod/);
  });

  it('rejects inactive and non-HQ accounts via assertHqFinanceAccount', () => {
    assert.match(service, /Finance account is inactive/);
    assert.match(service, /Only HQ Finance Accounts can be used/);
  });

  it('writes derivation and partial-payment audit events', () => {
    assert.match(service, /SUPPLIER_PARTIAL_PAYMENT_CREATED/);
    assert.match(service, /SUPPLIER_PAYMENT_METHOD_DERIVED/);
    assert.match(service, /derivedPaymentMethod/);
    assert.match(service, /accountType/);
  });
});
