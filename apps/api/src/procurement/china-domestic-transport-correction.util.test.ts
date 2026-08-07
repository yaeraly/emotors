import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import {
  buildChinaDomesticTransportReturnError,
  canAccountantReturnChinaDomesticTransportToSupplyManager,
  isChinaDomesticTransportAwaitingSupplyManagerCorrection,
  isChinaDomesticTransportCashierReturned,
} from './china-domestic-transport-correction.util';

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

assert(service.includes('returnChinaDomesticTransportToSupplyManager'), '1. dedicated return method exists');
assert(service.includes('CHINA_TRANSPORT_RETURNED_BY_CASHIER'), '3. cashier return audit');
assert(service.includes('CHINA_TRANSPORT_RETURNED_TO_SUPPLY_MANAGER'), '5. accountant return audit');
assert(service.includes('CHINA_TRANSPORT_RESUBMITTED'), '10. resubmit audit');
assert(service.includes('CHINA_TRANSPORT_CORRECTED'), '9. correction audit');
assert(
  accountantService.includes('returnChinaDomesticTransportToSupplyManager'),
  '5. accountant routes DOMESTIC_CHINA_TRANSPORT',
);
assert(billsPage.includes('canReturnChinaDomesticTransport'), '5. frontend return visibility for cashier-returned state');

assert(
  isChinaDomesticTransportCashierReturned({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
  }),
  '4. cashier-returned state detected',
);
assert(
  canAccountantReturnChinaDomesticTransportToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: 'RETURNED_TO_ACCOUNTANT',
    paidAmountKgs: 0,
  }),
  '5. accountant may return cashier-returned expense',
);
assert(
  !canAccountantReturnChinaDomesticTransportToSupplyManager({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '14. duplicate return blocked at validation layer',
);
assert(
  isChinaDomesticTransportAwaitingSupplyManagerCorrection({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
  }),
  '8. supply manager correction state',
);
assert(
  canAccountantReturnChinaDomesticTransportToSupplyManager({
    status: TransportExpenseStatus.WAITING_ACCOUNTANT,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '5b. direct accountant return from waiting',
);
assert(
  !canAccountantReturnChinaDomesticTransportToSupplyManager({
    status: TransportExpenseStatus.PAID,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  '13. paid expense blocked',
);
assertEqual(
  buildChinaDomesticTransportReturnError({
    status: TransportExpenseStatus.PAID,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  'Счёт уже полностью оплачен и не может быть возвращён обычным способом.',
  '13. paid error message',
);
assertEqual(
  buildChinaDomesticTransportReturnError({
    status: TransportExpenseStatus.RETURNED,
    executionStatus: null,
    paidAmountKgs: 0,
  }),
  'Счёт уже отправлен Supply Manager на исправление.',
  '14. already returned message',
);

console.log('china-domestic-transport-correction.util.test.ts: all assertions passed');
