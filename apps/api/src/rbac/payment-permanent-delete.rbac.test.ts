import { Role } from '@prisma/client';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canPermanentDeleteBusinessData,
} from './rbac';

function user(role: Role, permissions: string[] = []) {
  return { role, roles: [role], permissions };
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

assert(
  canPermanentDeleteBusinessData(user(Role.SYSTEM_ADMINISTRATOR, ['data.permanent_delete'])),
  'SysAdmin can permanent delete payments',
);
assert(!canPermanentDeleteBusinessData(user(Role.HQ_ACCOUNTANT)), 'HQ Accountant cannot permanent delete');
assert(!canPermanentDeleteBusinessData(user(Role.HQ_CASHIER, ['payments.manage'])), 'HQ Cashier cannot permanent delete');
assert(canCreateSupplierPayment(user(Role.HQ_ACCOUNTANT)), 'HQ Accountant retains create payment');
assert(canConfirmSupplierPayment(user(Role.HQ_CASHIER, ['payments.manage'])), 'HQ Cashier retains confirm');

console.log('payment-permanent-delete.rbac.test.ts: ok');
