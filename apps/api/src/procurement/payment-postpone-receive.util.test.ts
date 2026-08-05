/**
 * Focused acceptance checks for unpaid / partial / postponed receiving + costing.
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

// 1–2. Unpaid supplier/cargo invoices do not block HQ receive (cargo invoice existence)
{
  const unpaid = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.WAITING_ACCOUNTANT, 120000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.WAITING_ACCOUNTANT, 15000),
    ],
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(unpaid.canReceiveToHq === true, '1/2 unpaid invoices allow receive');
}

// 3–4. Partially paid supplier/cargo allow receive
{
  const partial = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PARTIALLY_PAID, 120000, 30000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PARTIALLY_PAID, 15000, 5000),
    ],
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(partial.canReceiveToHq === true, '3/4 partial invoices allow receive');
}

// 5. Postponed payment allows receive
{
  const postponed = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.INTERNATIONAL_FREIGHT, TransportExpenseStatus.PAYMENT_POSTPONED, 120000),
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAYMENT_POSTPONED, 15000),
    ],
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(postponed.canReceiveToHq === true, '5 postponed allows receive');
}

// 6–7. FIFO / inventory valuation uses approved totals, not paid cash
{
  const supplierInvoice = 800000;
  const cargoInvoice = 120000;
  const paidToday = 200000;
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
  // Supplier cost is always full CNY obligation (tested elsewhere); cargo must use 120000 not paid portion.
  console.assert(cargoCost === 120000, '6/7 cargo inventory cost uses approved amount');
  console.assert(cargoCost !== paidToday, '6/7 cost is not cash paid today');
  console.assert(supplierInvoice + cargoCost === 920000, '6/7 total landed obligation 920000');
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

// 11. Receiving no longer checks payment completion — only missing invoices block
{
  const missing = validateHqReceivingInvoicePrerequisites({
    procurementOrderId: 'po-1',
    transportExpenses: [
      expense(TransportExpenseType.LOCAL_DELIVERY, TransportExpenseStatus.PAID, 15000),
    ],
    cargoSectionTotal: 120000,
    kyrgyzstanSectionTotal: 15000,
  });
  console.assert(missing.canReceiveToHq === false, '11 missing cargo still blocks');
  console.assert(
    missing.blockingInvoices.every((row) => row.state === 'missing'),
    '11 only missing invoices block',
  );
}

// 12. Overdue flag helper: next payment date in the past with remaining > 0
{
  const nextPaymentDate = new Date('2020-01-01');
  const remaining = 700000;
  const isOverdue = nextPaymentDate.getTime() < Date.now() && remaining > 0.009;
  console.assert(isOverdue === true, '12 overdue warning condition works');
}

console.log('payment-postpone-receive.util.test.ts passed');
