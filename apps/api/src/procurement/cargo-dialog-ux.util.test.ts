/**
 * Cargo Payment action dialog UX — no transaction number, optional comment, one-click submit.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const dto = readFileSync(join(__dirname, './dto/transport-expense.dto.ts'), 'utf8');
const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const billsService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');

// 1-4. No transaction number in dialogs
assert(!page.includes('cargoPaymentForm.transactionNumber'), '1. no txn in pay form state');
assert(!page.includes("t('finance.transactionNumber')"), '2. no txn label in cargo modals');
assert(!page.includes('transactionNumberRequired'), '3. no txn validation');
const payDtoBlock = dto.slice(dto.indexOf('export class PayCargoTransportExpenseDto'));
assert(!payDtoBlock.includes('transactionNumber'), '4. removed from pay DTO');

// 5. Optional comment label in all cargo dialogs
const optionalLabelCount = (page.match(/finance\.billsToPay\.commentOptional/g) ?? []).length;
assert(optionalLabelCount >= 3, '5. optional comment in pay/postpone/return dialogs');

// 6-9. No required comment validation for cargo pay/return/postpone
const validateBlock = page.slice(
  page.indexOf('function validateCargoPaymentForm'),
  page.indexOf('async function submitCargoReturn'),
);
assert(!validateBlock.includes('commentRequired'), '6. pay allows empty comment');
const returnBlock = page.slice(
  page.indexOf('async function submitCargoReturn'),
  page.indexOf('async function submitPostponePayment'),
);
assert(!returnBlock.includes('commentRequired'), '9. return allows empty comment');
const postponeBlock = page.slice(
  page.indexOf('async function submitPostponePayment'),
  page.indexOf('async function submitCargoPayment'),
);
assert(postponeBlock.includes('postponeReasonRequired'), '10. postpone still requires reason');
assert(returnBlock.includes('returnReasonRequired'), '11. return still requires reason');

// 12-15. No second confirmation dialog
assert(!page.includes('cargoConfirm'), '12. no confirmation state');
assert(!page.includes('confirmCargoPayment'), '13. no pay confirmation handler');
assert(!page.includes('confirmPostponePayment'), '14. no postpone confirmation handler');
assert(!page.includes('confirmCargoReturn'), '15. no return confirmation handler');

// 16-18. One-click submit with pending guard
assert(page.includes('onClick={() => void submitCargoPayment()}'), '16. pay submits directly');
assert(page.includes('if (!cargoPaymentModal || saving) return'), '17. pay guards duplicate click');
assert(page.includes('disabled={saving'), '18. buttons disabled while saving');

// 19-20. Payload omits transactionNumber
const payloadBlock = page.slice(
  page.indexOf('return {'),
  page.indexOf('async function submitCargoReturn'),
);
assert(!payloadBlock.includes('transactionNumber'), '20. payload has no transactionNumber');

assert(payDtoBlock.includes('@IsOptional()'), '21. optional validation on DTO');
assert(payDtoBlock.includes('accountantComment?: string'), '21. optional accountantComment');

// 22. Finance generates internal transaction id from ledger
const ledgerService = readFileSync(
  join(__dirname, '../finance/finance-ledger.service.ts'),
  'utf8',
);
assert(ledgerService.includes('entryNumber: buildFinanceDocumentNumber'), '22. ledger entry number generated');
assert(service.includes('transactionNumber: ledger.entryNumber'), '22. pay uses ledger entry number');

// 23-24. Postpone/return create no ledger in service blocks
const returnService = service.slice(
  service.indexOf('returnCargoForCorrectionInTx'),
  service.indexOf('payCargoByAccountant'),
);
assert(!returnService.includes('postLedgerEntry'), '24. return no ledger');
const postponeService = billsService.slice(
  billsService.indexOf('if (source === \'TRANSPORT_EXPENSE\')'),
  billsService.indexOf('throw new BadRequestException(\'Postpone is not supported'),
);
assert(!postponeService.includes('postLedgerEntry'), '24. postpone no ledger');

// 25. Historical ledger entry numbers preserved in history mapper
assert(service.includes('transactionNumber: row.entryNumber'), '25. history keeps entry numbers');

console.log('cargo-dialog-ux.util.test.ts passed');
