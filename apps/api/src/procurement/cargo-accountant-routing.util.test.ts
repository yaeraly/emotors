/**
 * HQ Cargo accountant-to-cashier separation tests.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const cashier = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const actions = readFileSync(join(__dirname, './cargo-bill-actions.util.ts'), 'utf8');

const payBlock = service.slice(
  service.indexOf('payCargoByAccountant'),
  service.indexOf('confirmPayment(user: AuthUser'),
);

assert(payBlock.includes('Новый счет «Оплата карго» ожидает оплаты.'), 'cashier notification text');
assert(payBlock.includes('AlertType.TRANSPORT_EXPENSE_SENT_TO_CASHIER'), 'uses existing cashier alert');
assert(!payBlock.includes('AlertType.TRANSPORT_EXPENSE_PAID'), 'accountant does not emit paid alert');

assert(cashier.includes('Cashier must use the accountant-selected account'), 'cashier account lock');
assert(cashier.includes('TransportExpenseStatus.PENDING_CASHIER'), 'cashier queue includes pending cashier');
assert(cashier.includes('TransportExpenseStatus.PARTIALLY_PAID'), 'cashier queue includes partially paid');

assert(actions.includes("status === 'APPROVED'"), 'approved hides accountant actions');

console.log('cargo-accountant-routing.util.test.ts passed');
