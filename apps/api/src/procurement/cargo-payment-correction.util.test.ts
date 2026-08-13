/**
 * Cargo payment correction flow — DTO, payload, and calculation contracts.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateCargoPaymentAmounts } from './cargo-payment-calc.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const dtoSource = readFileSync(
  join(__dirname, './dto/transport-expense.dto.ts'),
  'utf8',
);
const serviceSource = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const panel = readFileSync(
  join(__dirname, '../../../web/src/components/ProcurementSectionPayablePanel.tsx'),
  'utf8',
);

// 1. Returned cargo can be opened — RETURNED is editable in the panel.
assert(panel.includes("EDITABLE_STATUSES = new Set(['DRAFT', 'RETURNED'])"), '1. RETURNED status is editable');

// 2-4. Update DTO accepts cargo source fields.
assert(dtoSource.includes('export class UpdateTransportExpenseDto'), 'UpdateTransportExpenseDto exists');
assert(dtoSource.includes('totalWeightKg?: number'), '2. totalWeightKg on update DTO');
assert(dtoSource.includes('cargoRateUsdPerKg?: number'), '3. cargoRateUsdPerKg on update DTO');
assert(dtoSource.includes('usdExchangeRate?: number'), '4. usdExchangeRate on update DTO');

// 5-6. Frontend update payload omits procurementOrderId, calculated totals, and bank fields.
assert(panel.includes('buildCargoSectionUpdatePayload'), 'explicit cargo update payload helper');
assert(panel.includes('updatePayload.totalWeightKg = Number(form.totalWeightKg)') || panel.includes('buildCargoSectionUpdatePayload({'), '5. update sends weight');
assert(
  !panel.includes('updatePayload.accountNumber'),
  '5. update does not send accountNumber for cargo',
);
assert(
  !panel.includes('updatePayload.procurementOrderId'),
  '5. update does not send procurementOrderId',
);
assert(
  !panel.includes('updatePayload.calculatedAmountUsd'),
  '6. update does not send calculatedAmountUsd',
);
assert(
  !panel.includes('updatePayload.calculatedAmountKgs'),
  '6. update does not send calculatedAmountKgs',
);

// 7-8. Backend calculates USD and KGS authoritatively.
const calc = calculateCargoPaymentAmounts({
  totalWeightKg: 100,
  cargoRateUsdPerKg: 2.5,
  usdExchangeRate: 89,
});
assertEqual(calc.calculatedAmountUsd, 250, '7. USD = weight × rate');
assertEqual(calc.calculatedAmountKgs, 22250, '8. KGS = USD × fx');

assert(serviceSource.includes('calculateCargoPaymentAmounts'), 'service uses backend cargo calc on update');
assert(serviceSource.includes("currency = 'KGS'"), 'cargo correction stores KGS amount');

// 9. procurementOrderId is preserved from existing record, not update DTO.
const updateDtoBlock = dtoSource.slice(
  dtoSource.indexOf('export class UpdateTransportExpenseDto'),
  dtoSource.indexOf('export class ApproveTransportExpenseDto'),
);
assert(!updateDtoBlock.includes('procurementOrderId'), '9. update DTO has no procurementOrderId');
assert(serviceSource.includes('existing.procurementOrderId'), 'service preserves linked procurement order');

// 10. Non-returned cargo gets Russian correction guard.
assert(
  serviceSource.includes('Этот счет карго недоступен для исправления.'),
  '10. non-editable cargo error message',
);

// 11-12. Correction path does not post ledger entries in update().
const updateBlock = serviceSource.slice(
  serviceSource.indexOf('update(user: AuthUser, id: string, dto: UpdateTransportExpenseDto)'),
  serviceSource.indexOf('submitToAccountant(user: AuthUser, id: string)'),
);
assert(!updateBlock.includes('postLedgerEntry'), '11. correction update creates no ledger entry');
assert(!updateBlock.includes('availableBalance'), '12. correction update changes no account balance');

// 13. Historical audits remain; correction adds dedicated audit actions.
assert(serviceSource.includes('CARGO_PAYMENT_CORRECTED'), '13. correction audit');
assert(serviceSource.includes('TRANSPORT_EXPENSE_RETURNED'), '13. return history preserved');
assert(serviceSource.includes('CARGO_PAYMENT_RESUBMITTED'), '14. resubmission audit');

// 15. Nullable cargo fields normalize to empty strings in the form.
assert(
  panel.includes("primaryExpense.totalWeightKg != null ? String(primaryExpense.totalWeightKg) : ''"),
  '15. totalWeightKg controlled input',
);
assert(
  panel.includes("primaryExpense.cargoRateUsdPerKg != null ? String(primaryExpense.cargoRateUsdPerKg) : ''"),
  '15. cargoRateUsdPerKg controlled input',
);
assert(
  panel.includes("primaryExpense.usdExchangeRate != null ? String(primaryExpense.usdExchangeRate) : ''"),
  '15. usdExchangeRate controlled input',
);

// Create flow still sends procurementOrderId for new cargo payments.
assert(panel.includes('procurementOrderId: orderId'), 'create still links procurement order');

console.log('cargo-payment-correction.util.test.ts passed');
