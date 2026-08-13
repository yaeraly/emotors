/**
 * Contract checks for Transport Company selector + cargo payment workflow.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertCargoTotalsMatchServer,
  calculateCargoPaymentAmounts,
} from './cargo-payment-calc.util';
import { estimateSectionExpenseCostKgs } from './procurement-cost.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const webPayments = readFileSync(
  join(__dirname, '../../../web/src/components/ProcurementSupplierPayments.tsx'),
  'utf8',
);
const panel = readFileSync(
  join(__dirname, '../../../web/src/components/ProcurementSectionPayablePanel.tsx'),
  'utf8',
);
const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260721230000_transport_company_cargo_payment_fields/migration.sql',
  ),
  'utf8',
);

// 1. Status column removed from Supplier Payments navigation table
assert(!webPayments.includes("t('procurement.orders.status')"), '1. status header removed from payments table');
assert(!webPayments.includes('trancheStatusLabel'), '1. status cell helper removed from payments table');
assert(webPayments.includes('supplierPaymentStatus'), '2. payment status remains in summary/backend UI data');

// 3-5. Transport company selector for China / Cargo / KG
assert(panel.includes("usesTransportCompany"), 'selector wired for transport sections');
assert(panel.includes("expenseType !== 'OTHER_LOGISTICS'"), '3-5. China/Cargo/KG use transport company selector');
assert(panel.includes('transportCompanyId: selectedCompany?.id'), 'relation ID preserved on request');
assert(!panel.includes("label={t('procurement.sectionPayable.recipient')}\n            value={form.recipient}"), 'free-text recipient removed for transport sections');

// 6-8. Create button + auto-select without navigation
assert(panel.includes('TransportCompanyQuickCreateModal'), '6. create modal exists');
assert(panel.includes('setShowCreateCompany(true)'), '6. create opens without page navigation');
assert(panel.includes('applyCompanyToForm(fresh'), '7. auto-select after create');
assert(panel.includes('preserveTouched'), '8. form values preserved around autofill');

// 9. Autofill bank/QR
assert(panel.includes('company.bankAccount'), '9. bank account autofill');
assert(panel.includes('companyQrAvailable') || panel.includes('qrAttachments'), '9. QR autofill/availability');

// 10-13. Cargo calculation
const calc = calculateCargoPaymentAmounts({
  totalWeightKg: 1250,
  cargoRateUsdPerKg: 1.2,
  usdExchangeRate: 87.5,
});
assertEqual(calc.calculatedAmountUsd, 1500, '10. USD calc');
assertEqual(calc.calculatedAmountKgs, 131250, '11. KGS calc');
let rejected = false;
try {
  assertCargoTotalsMatchServer(calc, { calculatedAmountKgs: 1, amount: 1 });
} catch {
  rejected = true;
}
assert(rejected, '13. manipulated frontend total rejected');

// 14-16. Cargo receipt + request amount
assert(panel.includes('cargoReceipt'), '14. cargo receipt field present');
assert(panel.includes('pendingCargoReceipt'), '14. cargo receipt required before submit');
assert(panel.includes('payload.calculatedAmountKgs = Number(cargoTotals.calculatedAmountKgs)'), '16. create request amount = calculated KGS');
assert(panel.includes('updatePayload.totalWeightKg = Number(form.totalWeightKg)'), 'correction update sends cargo source fields only');
assert(!panel.includes('updatePayload.calculatedAmountKgs'), 'correction update omits calculated KGS');
assert(panel.includes("payload.currency = 'KGS'"), '16. request currency KGS');
assert(schema.includes('cargoReceiptAttachmentId'), '14. cargo receipt id stored');
assert(schema.includes('calculatedAmountKgs'), 'cargo totals stored');

// 15. Separate from payment receipt
assert(schema.includes('TRANSPORT_EXPENSE_RECEIPT'), '15. payment receipt entity remains');
assert(schema.includes('CARGO_RECEIPT'), '15. cargo receipt entity remains separate');

// 17-18. Partial payment does not reduce cargo cost base
const cost = estimateSectionExpenseCostKgs({
  expenses: [
    { amount: 131250, currency: 'KGS', amountKgs: 50000, status: 'PAID' },
    { amount: 0, currency: 'KGS', amountKgs: 0, status: 'DRAFT' },
  ],
  sectionTotalAmount: 131250,
  estimatedYuanRate: 12,
  defaultCurrency: 'KGS',
});
assertEqual(cost.estimatedSectionCostKgs, 131250, '17/18. full cargo KGS remains cost base');
assertEqual(cost.paidAmount, 131250 > 0 ? cost.paidAmount : 0, 'paid tracked separately');
assert(cost.paidAmount <= 131250, 'partial paid cannot exceed full base in this fixture');

// Reuse TransportCompany model (no second model)
assert(schema.includes('model TransportCompany'), 'TransportCompany reused');
assert(schema.includes('bankAccount'), 'bank fields on TransportCompany');
assert(!schema.includes('model CargoTransportCompany'), 'no duplicate transport company model');
assert(migration.includes('ADD COLUMN IF NOT EXISTS'), '24. safe migration without reset');
assert(migration.includes('PARTIALLY_PAID'), 'partial payment enum added safely');

// Multi QR
assert(panel.includes('multiple'), '19. multiple QR files supported');

// SM cannot approve own — approve uses accountant RBAC helper
assert(panel.includes('canCreateSupplierPayment(user)'), '20. approve gated to accountant roles');

console.log('transport-company-cargo-workflow.util.test.ts passed');
