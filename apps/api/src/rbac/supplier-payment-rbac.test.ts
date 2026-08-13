import { Role } from '@prisma/client';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canEditSupplierPayment,
  canReturnSupplierPaymentToAccountant,
  canSendProcurementInvoiceToAccountant,
  canSendSupplierPaymentToCashier,
} from './rbac';

function user(role: Role, permissions: string[] = []) {
  return { role, roles: [role], permissions };
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

assert(canSendProcurementInvoiceToAccountant(user(Role.SUPPLY_CHAIN_MANAGER)), 'SM can send invoice');
assert(!canCreateSupplierPayment(user(Role.SUPPLY_CHAIN_MANAGER)), 'SM cannot create payment');
assert(!canSendSupplierPaymentToCashier(user(Role.SUPPLY_CHAIN_MANAGER)), 'SM cannot send to cashier');
assert(!canConfirmSupplierPayment(user(Role.SUPPLY_CHAIN_MANAGER)), 'SM cannot confirm');

assert(canCreateSupplierPayment(user(Role.HQ_ACCOUNTANT)), 'HQ Accountant can create payment');
assert(canEditSupplierPayment(user(Role.HQ_ACCOUNTANT)), 'HQ Accountant can edit payment');
assert(canSendSupplierPaymentToCashier(user(Role.HQ_ACCOUNTANT)), 'HQ Accountant can send to cashier');
assert(
  !canConfirmSupplierPayment(user(Role.HQ_ACCOUNTANT, ['payments.manage', 'finance.view'])),
  'HQ Accountant cannot confirm even with payments.manage',
);
assert(
  !canReturnSupplierPaymentToAccountant(user(Role.HQ_ACCOUNTANT, ['payments.manage'])),
  'HQ Accountant cannot return as cashier',
);

assert(canConfirmSupplierPayment(user(Role.HQ_CASHIER, ['payments.manage'])), 'HQ Cashier can confirm');
assert(
  canReturnSupplierPaymentToAccountant(user(Role.HQ_CASHIER, ['payments.manage'])),
  'HQ Cashier can return',
);
assert(!canCreateSupplierPayment(user(Role.HQ_CASHIER, ['payments.manage'])), 'HQ Cashier cannot create');

assert(
  !canConfirmSupplierPayment(user(Role.CASHIER, ['payments.manage'])),
  'Branch cashier cannot confirm China Purchase payments',
);

assert(canCreateSupplierPayment(user(Role.FINANCE_MANAGER)), 'Finance Manager can create');
assert(canConfirmSupplierPayment(user(Role.CEO)), 'CEO can confirm');
assert(canConfirmSupplierPayment(user(Role.OWNER)), 'Owner can confirm');

console.log('supplier-payment-rbac.test.ts: ok');
