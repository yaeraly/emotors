import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ProcurementPaymentInfoMethod,
  TransportExpenseType,
} from '@prisma/client';
import {
  resolveCargoRecipientPaymentMethod,
  shouldRepairCargoPaymentMethod,
} from './cargo-payment-form.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const cashierService = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const accountantPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const cashierPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);

const payCargoBlock = service.slice(
  service.indexOf('payCargoByAccountant'),
  service.indexOf('confirmPayment(user: AuthUser'),
);

assert(
  payCargoBlock.includes('resolveCargoRecipientPaymentMethod'),
  '2. payCargo preserves cargo recipient payment method',
);
assert(
  !payCargoBlock.includes('paymentMethod: procurementPaymentMethod'),
  '2. payCargo no longer overwrites with funding account method',
);
assert(
  payCargoBlock.includes('derivedFundingMethod'),
  '7. funding account method kept separate in audit',
);
assert(service.includes('repairCargoPaymentMethodIfNeededInTx'), '10. historical repair helper');
assert(service.includes('syncCargoRecipientPaymentMethod'), '10. idempotent repair entry point');
assert(cashierService.includes('syncCargoRecipientPaymentMethod'), '10. cashier detail triggers repair');

assert(
  accountantPage.includes('!isCargoPayment') &&
    accountantPage.includes('finance.billsToPay.basis'),
  '1. basis hidden for cargo payment',
);
assert(
  cashierPage.includes("t(`procurement.payments.method.${selected.paymentMethod}`)"),
  '5. cashier shows localized payment method label',
);
assert(!cashierPage.includes('value={selected.paymentMethod}'), '6. cashier no raw enum in detail');

assertEqual(
  resolveCargoRecipientPaymentMethod({
    expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
    paymentMethod: ProcurementPaymentInfoMethod.BANK_ACCOUNT,
    qrAttachmentCount: 1,
  }),
  ProcurementPaymentInfoMethod.QR_CODE,
  '3. QR cargo resolves to QR_CODE',
);
assert(
  shouldRepairCargoPaymentMethod({
    expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
    paymentMethod: ProcurementPaymentInfoMethod.BANK_ACCOUNT,
    qrAttachmentCount: 2,
  }),
  '10. inconsistent cargo with QR needs repair',
);
assert(
  !shouldRepairCargoPaymentMethod({
    expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
    paymentMethod: ProcurementPaymentInfoMethod.BANK_ACCOUNT,
    qrAttachmentCount: 1,
  }),
  '9. non-cargo transport unchanged',
);

console.log('cargo-payment-method-consistency.util.test.ts passed');
