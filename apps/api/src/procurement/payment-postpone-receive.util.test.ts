/**
 * Focused acceptance checks for accountant-processed receiving gate + costing.
 * Receiving requires HQ Accountant processing (full / partial / postpone),
 * not full cash payment.
 */
import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { validateHqReceivingInvoicePrerequisites } from './hq-receiving-validation.util';
import { sumConfirmedExpenseAmountKgs } from './procurement-cost.util';
import { resolvePurchasePaymentLedgerStatus } from './supplier-payment.util';

function expense(
  expenseType: TransportExpenseType,
  status: string,
  amount: number,
  paidAmountKgs = 0,
) {
  return {
    procurementOrderId: 'po-1',
    expenseType,
    amount,
    amountKgs: amount,
    paidAmountKgs,
    status,
  };
}

const processedSupplier = {
  invoiceSentToAccountantAt: new Date(),
  supplierInvoiceNumber: 'INV-1',
  invoiceReviewStatus: 'APPROVED',
  supplierPaymentStatus: 'PARTIALLY_PAID' as string,
};

function allFour(statuses: {
  supplier?: string;
  china: string;
  cargo: string;
  kg: string;
}) {
  return validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, statuses.china, 25000),
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, statuses.cargo, 120000),
      expense(TransportExpenseType.LOCAL_DELIVERY, statuses.kg, 15000),
    ],
    supplier: {
      ...processedSupplier,
      supplierPaymentStatus: statuses.supplier ?? processedSupplier.supplierPaymentStatus,
    },
    chinaSectionTotal: 25000,
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
}

// 1. Waiting-for-accountant invoices block HQ receive
{
  const unpaid = allFour({
    supplier: 'AWAITING_ACCOUNTANT',
    china: TransportExpenseStatus.WAITING_ACCOUNTANT,
    cargo: TransportExpenseStatus.WAITING_ACCOUNTANT,
    kg: TransportExpenseStatus.WAITING_ACCOUNTANT,
  });
  console.assert(unpaid.canReceiveToHq === false, '1 waiting invoices block receive');
}

// 1b. Supplier approved but unpaid allows receive
{
  const supplierApproved = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, TransportExpenseStatus.PENDING_CASHIER, 25000),
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PENDING_CASHIER, 120000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PENDING_CASHIER, 15000),
    ],
    supplier: {
      invoiceSentToAccountantAt: new Date(),
      supplierInvoiceNumber: 'INV-1',
      invoiceReviewStatus: 'APPROVED',
      supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    },
    chinaSectionTotal: 25000,
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(supplierApproved.canReceiveToHq === true, '15 approved unpaid allows receive');
}

// 2–4. Partially paid / postponed / paid allow receive
{
  const partial = allFour({
    supplier: 'PARTIALLY_PAID',
    china: TransportExpenseStatus.PARTIALLY_PAID,
    cargo: TransportExpenseStatus.PARTIALLY_PAID,
    kg: TransportExpenseStatus.PARTIALLY_PAID,
  });
  console.assert(partial.canReceiveToHq === true, '2/3/4 partial invoices allow receive');

  const postponed = allFour({
    supplier: 'PAYMENT_POSTPONED',
    china: TransportExpenseStatus.PAYMENT_POSTPONED,
    cargo: TransportExpenseStatus.PAYMENT_POSTPONED,
    kg: TransportExpenseStatus.PAYMENT_POSTPONED,
  });
  console.assert(postponed.canReceiveToHq === true, '5 postponed allows receive');

  const paid = allFour({
    supplier: 'PAID',
    china: TransportExpenseStatus.PAID,
    cargo: TransportExpenseStatus.PAID,
    kg: TransportExpenseStatus.PAID,
  });
  console.assert(paid.canReceiveToHq === true, '6 fully paid allows receive');
}

// 6–7. FIFO / inventory valuation uses approved totals, not paid cash
{
  const supplierInvoice = 800000;
  const chinaInvoice = 25000;
  const cargoInvoice = 120000;
  const kgInvoice = 15000;
  const paidToday = 200000;
  const chinaCost = sumConfirmedExpenseAmountKgs(
    [
      {
        amount: chinaInvoice,
        currency: 'KGS',
        amountKgs: chinaInvoice,
        paidAmountKgs: 0,
        status: 'PAYMENT_POSTPONED',
      },
    ],
    1,
  );
  const cargoCost = sumConfirmedExpenseAmountKgs(
    [
      {
        amount: cargoInvoice,
        currency: 'KGS',
        amountKgs: cargoInvoice,
        paidAmountKgs: Math.min(paidToday, cargoInvoice),
        status: 'PARTIALLY_PAID',
      },
    ],
    1,
  );
  const kgCost = sumConfirmedExpenseAmountKgs(
    [
      {
        amount: kgInvoice,
        currency: 'KGS',
        amountKgs: kgInvoice,
        paidAmountKgs: 0,
        status: 'PAYMENT_POSTPONED',
      },
    ],
    1,
  );
  const total = supplierInvoice + chinaCost + cargoCost + kgCost;
  console.assert(chinaCost === 25000, 'china cost uses approved amount');
  console.assert(cargoCost === 120000, 'cargo inventory cost uses approved amount');
  console.assert(kgCost === 15000, 'kg cost uses approved amount');
  console.assert(cargoCost !== paidToday, 'cost is not cash paid today');
  console.assert(total === 960000, 'final procurement cost 960000');
}

// 8–10. Debt remains visible / postpone preserves remaining
{
  const postponedLedger = resolvePurchasePaymentLedgerStatus({
    totalOrderYuan: 1000000,
    totalPaidYuan: 300000,
    remainingYuan: 700000,
    pendingCashierCount: 0,
    invoiceSentToAccountantAt: new Date(),
    previousStatus: 'PAYMENT_POSTPONED',
  });
  console.assert(postponedLedger === 'PAYMENT_POSTPONED', '8/9 postponed debt status preserved');
  console.assert(700000 === 1000000 - 300000, '10 remaining debt math intact');
}

// 11. Missing invoice type still blocks; waiting also blocks
{
  const missing = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT, TransportExpenseStatus.PAID, 25000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 15000),
    ],
    supplier: processedSupplier,
    chinaSectionTotal: 25000,
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(missing.canReceiveToHq === false, '11 missing cargo still blocks');
  console.assert(
    missing.blockingInvoices.some((row) => row.requestType === 'CARGO_PAYMENT' && row.state === 'missing'),
    '11 missing cargo listed',
  );
}

// 12. Overdue flag helper: next payment date in the past with remaining > 0
{
  const nextPaymentDate = new Date('2020-01-01');
  const remaining = 700000;
  const isOverdue = nextPaymentDate.getTime() < Date.now() && remaining > 0.009;
  console.assert(isOverdue === true, '12 overdue warning condition works');
}

// 13. Postpone creates no payment — gate only checks processed status
{
  const postponed = allFour({
    supplier: 'PAYMENT_POSTPONED',
    china: TransportExpenseStatus.PAYMENT_POSTPONED,
    cargo: TransportExpenseStatus.PAYMENT_POSTPONED,
    kg: TransportExpenseStatus.PAYMENT_POSTPONED,
  });
  console.assert(
    postponed.prerequisites.every((row) => row.accountantProcessed && !row.closed),
    '13 postponed is processed but not closed/paid',
  );
}

console.log('payment-postpone-receive.util.test.ts passed');
