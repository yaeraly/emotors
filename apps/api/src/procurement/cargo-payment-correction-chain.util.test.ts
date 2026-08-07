import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import {
  buildCargoPaymentReturnError,
  canAccountantReturnCargoToSupplyManager,
  isCargoPaymentAwaitingSupplyManagerCorrection,
  isCargoPaymentCashierReturned,
} from './cargo-payment-correction.util';
import { getCargoBillActionVisibility } from './cargo-bill-actions.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const billsPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);

assert(service.includes('cargo-payment-correction.util'), '1. correction util imported');
assert(service.includes('CARGO_PAYMENT_RETURNED_TO_SUPPLY_MANAGER'), '5. accountant forward audit');
assert(service.includes('isCargoPaymentAwaitingSupplyManagerCorrection'), '6. idempotent SM state');
assert(billsPage.includes('executionStatus: detail.executionStatus'), '4. frontend passes executionStatus');

assert(
  isCargoPaymentCashierReturned({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  '3. cashier-returned state detected',
);
assert(
  canAccountantReturnCargoToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    paidAmountKgs: 0,
  }),
  '5. accountant may return cashier-returned cargo',
);
assert(
  !canAccountantReturnCargoToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '14. duplicate return blocked at validation layer',
);
assert(
  isCargoPaymentAwaitingSupplyManagerCorrection({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
  }),
  '8. supply manager correction state',
);
assertEqual(
  buildCargoPaymentReturnError({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  'Расход уже отправлен Supply Manager на исправление.',
  '14. already forwarded message',
);
const returnBlock = service.slice(
  service.indexOf('returnCargoForCorrectionInTx'),
  service.indexOf('payCargoByAccountant'),
);
assert(returnBlock.includes('buildCargoPaymentReturnError'), '6. cargo return uses Russian error helper');
assert(!returnBlock.includes('Expense cannot be returned in current status'), '6. generic invalid-status removed from cargo return');

const cashierReturnedVisibility = getCargoBillActionVisibility({
  uiStatus: 'RETURNED',
  paidAmount: 0,
  remainingAmount: 100000,
  executionStatus: 'RETURNED_TO_ACCOUNTANT',
});
assert(cashierReturnedVisibility.showReturnForCorrection, '4. HQ Accountant sees return action');
assert(cashierReturnedVisibility.showPartial, '4b. cashier returned cargo allows partial resend');
assert(cashierReturnedVisibility.showCashierReturnedBanner, '4c. cashier returned banner');
assert(!cashierReturnedVisibility.showAwaitingCorrectionBanner, '4d. no SM awaiting banner');

const smCorrectionVisibility = getCargoBillActionVisibility({
  uiStatus: 'RETURNED',
  paidAmount: 0,
  remainingAmount: 100000,
  executionStatus: null,
});
assert(!smCorrectionVisibility.showReturnForCorrection, '8. no duplicate return after forward');
assert(smCorrectionVisibility.showAwaitingCorrectionBanner, '8. awaiting SM correction banner');

console.log('cargo-payment-correction-chain.util.test.ts passed');
