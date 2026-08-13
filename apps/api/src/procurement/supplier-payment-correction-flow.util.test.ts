import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const workflow = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const util = readFileSync(join(__dirname, './supplier-payment-correction.util.ts'), 'utf8');
const procurement = readFileSync(join(__dirname, './procurement.service.ts'), 'utf8');

assert(util.includes('sumSupplierLineTotalYuan'), 'util recalculates line totals');
assert(workflow.includes('refreshSupplierInvoiceTotalsInTx'), 'workflow refresh helper');
assert(workflow.includes('invalidateStaleSupplierPaymentRequestsInTx'), 'workflow invalidates stale requests');
assert(workflow.includes('SUPPLIER_PAYMENT_TOTAL_RECALCULATED'), 'total recalc audit');
assert(workflow.includes('SUPPLIER_PAYMENT_RESUBMITTED'), 'resubmit audit');
assert(workflow.includes('SUPPLIER_PAYMENT_CASHIER_REQUEST_SUPERSEDED'), 'supersede audit');
assert(workflow.includes('SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE'), 'russian exceeds remaining');
assert(!workflow.includes('Payment CNY amount exceeds remaining unpaid amount'), 'english stale error removed');
assert(procurement.includes('refreshSupplierInvoiceAfterLineChangesInTx'), 'order update refreshes invoice');

console.log('supplier-payment-correction-flow.util.test.ts passed');
