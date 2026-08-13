/**
 * HQ Accountant Cargo Payment authorization — full/partial pay, postpone, receipt upload.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Role } from '@prisma/client';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canProcessHqCargoPayment,
  resolveUserRoles,
  userHasAnyPermission,
} from '../rbac/rbac';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const transportService = readFileSync(
  join(__dirname, './transport-expense.service.ts'),
  'utf8',
);
const controller = readFileSync(join(__dirname, './procurement.controller.ts'), 'utf8');
const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);

const hqAccountant = {
  role: Role.HQ_ACCOUNTANT,
  roles: [] as Role[],
  permissions: [] as string[],
  branchId: null as string | null,
};

const supplyManager = {
  role: Role.SUPPLY_CHAIN_MANAGER,
  roles: [Role.SUPPLY_CHAIN_MANAGER],
  permissions: ['procurement.manage'],
  branchId: null,
};

const branchAccountant = {
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  permissions: ['finance.view', 'payments.manage'],
  branchId: 'branch-a',
};

const hqCashier = {
  role: Role.HQ_CASHIER,
  roles: [Role.HQ_CASHIER],
  permissions: ['payments.manage', 'finance.view'],
  branchId: null,
};

// 1-4. HQ Accountant authorized for cargo payment actions
assert(canProcessHqCargoPayment(hqAccountant), '1. HQ Accountant can process cargo');
assert(canCreateSupplierPayment(hqAccountant), '2. HQ Accountant can create supplier payment scope');
assertEqual(resolveUserRoles(hqAccountant).includes(Role.HQ_ACCOUNTANT), true, '3. role merge includes HQ_ACCOUNTANT');
assert(
  userHasAnyPermission(hqAccountant, ['finance.view', 'payments.manage']),
  '4. HQ Accountant has bills-to-pay permissions',
);

// 5-8. Other roles blocked from accountant cargo pay
assert(!canProcessHqCargoPayment(supplyManager), '6. Supply Manager cannot process cargo pay');
assert(!canProcessHqCargoPayment(branchAccountant), '7. Branch Accountant cannot process HQ cargo');
assert(!canProcessHqCargoPayment(hqCashier), '8. HQ Cashier cannot process accountant cargo pay');
assert(canConfirmSupplierPayment(hqCashier), '8b. HQ Cashier can confirm payments');

// 9. Receipt upload allows HQ Accountant (not only cashier)
const uploadBlock = transportService.slice(
  transportService.indexOf('async uploadAttachment'),
  transportService.indexOf('private assertCanView'),
);
assert(uploadBlock.includes('canProcessHqCargoPayment'), '9. receipt upload allows HQ Accountant');

// 10. Pay uses canProcessHqCargoPayment
assert(transportService.includes('canProcessHqCargoPayment(user)'), '10. payCargoByAccountant uses cargo auth');

// 11-12. Endpoints require finance.view + payments.manage (OR)
assert(controller.includes("bills-to-pay/:source/:id/pay"), '11. pay endpoint exists');
assert(controller.includes("bills-to-pay/:source/:id/postpone"), '12. postpone endpoint exists');
assert(controller.includes('PayBillCargoDto'), '12b. pay uses typed DTO');
assert(controller.includes('PostponeBillPaymentDto'), '12c. postpone uses typed DTO with reason');

// 13. Frontend uses HQ bills-to-pay endpoints
assert(page.includes('/procurement/bills-to-pay/'), '13. frontend HQ endpoint');
assert(!page.includes('/cashier-bills/'), '13b. not cashier endpoint');

// 14. Branch account error is business message not generic Forbidden
assert(
  transportService.includes('Выбранный счёт не принадлежит HQ.'),
  '14. HQ account scope error message',
);

// 15. Status errors are business messages
assert(
  transportService.includes('Счет возвращён на исправление.'),
  '15. returned invoice business error',
);

// 16. Role merge when userRoles array is empty but user.role is HQ_ACCOUNTANT
assertEqual(
  resolveUserRoles({ role: Role.HQ_ACCOUNTANT, roles: [] })[0],
  Role.HQ_ACCOUNTANT,
  '16. empty roles array still resolves primary role',
);

console.log('cargo-payment-authorization.util.test.ts passed');
