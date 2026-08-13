import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseType, ProcurementPaymentInfoMethod } from '@prisma/client';
import {
  isCargoPaymentExpenseType,
  resolveCargoPaymentMethod,
} from './cargo-payment-form.util';
import { buildCargoSectionUpdatePayload } from '../../../web/src/lib/cargo-payment-form.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const panel = readFileSync(
  join(__dirname, '../../../web/src/components/ProcurementSectionPayablePanel.tsx'),
  'utf8',
);
const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');

assertEqual(
  resolveCargoPaymentMethod(TransportExpenseType.INTERNATIONAL_FREIGHT, ProcurementPaymentInfoMethod.BANK_ACCOUNT),
  ProcurementPaymentInfoMethod.QR_CODE,
  '1. cargo always resolves to QR payment method',
);
assert(isCargoPaymentExpenseType(TransportExpenseType.INTERNATIONAL_FREIGHT), '1b. cargo expense type');

const updatePayload = buildCargoSectionUpdatePayload({
  supplierCarrier: 'Carrier',
  totalWeightKg: 100,
  cargoRateUsdPerKg: 2,
  usdExchangeRate: 89,
});
assertEqual(updatePayload.paymentMethod, 'QR_CODE', '9. correction payload uses QR');
assert(!('accountNumber' in updatePayload), '9. no accountNumber in payload');
assert(!('bankName' in updatePayload), '4. no bankName in payload');
assert(!('accountHolder' in updatePayload), '5. no accountHolder in payload');

assert(panel.includes('usesCargoQrPaymentForm'), '2. shared cargo QR form helper');
assert(panel.includes('buildCargoSectionUpdatePayload'), '2. shared update payload builder');
assert(panel.includes('removeQrFromExpense'), '8. existing QR can be replaced');
assert(
  panel.includes('!usesCargoQrForm && form.paymentMethod === \'BANK_ACCOUNT\''),
  '3. bank fields hidden for cargo',
);
assert(
  panel.includes('usesCargoQrForm || form.paymentMethod === \'QR_CODE\''),
  '6. QR attachment visible for cargo',
);
assert(panel.includes('procurement.paymentInfo.uploadQr'), '6. QR upload control');

const updateBlock = service.slice(
  service.indexOf('update(user: AuthUser, id: string, dto: UpdateTransportExpenseDto)'),
  service.indexOf('submitToAccountant(user: AuthUser, id: string)'),
);
assert(updateBlock.includes('resolveCargoPaymentMethod'), '10. backend resolves cargo payment method');
assert(updateBlock.includes('bankName: isCargo'), '10. backend clears bank fields for cargo');

console.log('cargo-payment-form.util.test.ts passed');
