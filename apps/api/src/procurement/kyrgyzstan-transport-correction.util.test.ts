import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import {
  buildKyrgyzstanTransportReturnError,
  canAccountantReturnKyrgyzstanTransportToSupplyManager,
  isKyrgyzstanTransportAwaitingSupplyManagerCorrection,
  isKyrgyzstanTransportCashierReturned,
} from './kyrgyzstan-transport-correction.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const accountantService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
const billsPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);

assert(service.includes('returnKyrgyzstanTransportToSupplyManager'), '1. dedicated return method exists');
assert(service.includes('KYRGYZSTAN_TRANSPORT_RETURNED_BY_CASHIER'), '3. cashier return audit');
assert(service.includes('KYRGYZSTAN_TRANSPORT_RETURNED_TO_SUPPLY_MANAGER'), '5. accountant return audit');
assert(service.includes('KYRGYZSTAN_TRANSPORT_RESUBMITTED'), '10. resubmit audit');
assert(service.includes('KYRGYZSTAN_TRANSPORT_CORRECTED'), '9. correction audit');
assert(accountantService.includes('returnKyrgyzstanTransportToSupplyManager'), '5. accountant routes LOCAL_DELIVERY');
assert(billsPage.includes('canTakeTransportForAccountantReview'), '3. frontend take review visibility');

assert(
  isKyrgyzstanTransportCashierReturned({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  '4. cashier-returned state detected',
);
assert(
  !canAccountantReturnKyrgyzstanTransportToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    paidAmountKgs: 0,
  }),
  '5. accountant cannot return cashier-returned expense before take review',
);
assert(
  canAccountantReturnKyrgyzstanTransportToSupplyManager({
    status: TransportExpenseStatus.UNDER_REVIEW,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    paidAmountKgs: 0,
  }),
  '5c. accountant may return after take review',
);
assert(
  !canAccountantReturnKyrgyzstanTransportToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '14. duplicate return blocked at validation layer',
);
assert(
  isKyrgyzstanTransportAwaitingSupplyManagerCorrection({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
  }),
  '8. supply manager correction state',
);
assert(
  canAccountantReturnKyrgyzstanTransportToSupplyManager({
    status: TransportExpenseStatus.WAITING_ACCOUNTANT,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '5b. direct accountant return from waiting',
);
assert(
  !canAccountantReturnKyrgyzstanTransportToSupplyManager({
    status: TransportExpenseStatus.PAID,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '13. paid expense blocked',
);
assertEqual(
  buildKyrgyzstanTransportReturnError({
    status: TransportExpenseStatus.PAID,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  'Этот расход уже оплачен и не может быть возвращён через обычное исправление.',
  '13. paid error message',
);
assertEqual(
  buildKyrgyzstanTransportReturnError({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  'Расход уже отправлен Supply Manager на исправление.',
  '14. already returned message',
);

console.log('kyrgyzstan-transport-correction.util.test.ts: all assertions passed');
