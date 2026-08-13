/**
 * Approved-but-unpaid import expenses must appear in landed cost (Kyrgyzstan transport focus).
 */
import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  buildProcurementImportExpenseLines,
  sumConfirmedExpenseAmountKgs,
} from './procurement-cost.util';

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.02) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const orderId = 'po-kg-1';

function kgExpense(status: string, amount = 15000, paid = 0) {
  return {
    procurementOrderId: orderId,
    expenseType: TransportExpenseType.LOCAL_DELIVERY,
    amount,
    currency: 'KGS',
    amountKgs: amount,
    paidAmountKgs: paid,
    status,
  };
}

// 1. Approved unpaid Kyrgyzstan transport in cost sum
{
  const kgs = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.PENDING_CASHIER, 15000, 0)],
    12,
  );
  assertClose(kgs, 15000, '1. approved unpaid kyrgyzstan in cost');
}

// 2–3. Partially paid and postponed still use full approved amount
{
  const partial = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.PARTIALLY_PAID, 15000, 5000)],
    12,
  );
  assertClose(partial, 15000, '2. partial uses approved total');

  const postponed = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.PAYMENT_POSTPONED, 15000, 0)],
    12,
  );
  assertClose(postponed, 15000, '3. postponed uses approved total');
}

// 4–5. Waiting / rejected excluded
{
  const waiting = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.WAITING_ACCOUNTANT, 15000, 0)],
    12,
  );
  assertClose(waiting, 0, '5. waiting excluded');

  const rejected = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.REJECTED, 15000, 0)],
    12,
  );
  assertClose(rejected, 0, '4. rejected excluded');
}

// 6. Landed cost uses approved amount not paid cash
{
  const approved = 15000;
  const paid = 0;
  const cost = sumConfirmedExpenseAmountKgs(
    [kgExpense(TransportExpenseStatus.PENDING_CASHIER, approved, paid)],
    12,
  );
  assertClose(cost, approved, '6. cost from approved');
  assertClose(cost === paid, false, '6. not paid cash');
}

// 7–8. Import expense lines for Себестоимость visibility
{
  const lines = buildProcurementImportExpenseLines({
    estimatedYuanRate: 12,
    supplier: {
      invoiceSentToAccountantAt: new Date(),
      invoiceReviewStatus: 'APPROVED',
      supplierPaymentStatus: 'PARTIALLY_PAID',
      totalYuan: 66666.67,
      totalPaidYuan: 25000,
      totalPaidKgs: 300000,
      estimatedSupplierCostKgs: 800000.04,
    },
    transportExpenses: [
      kgExpense(TransportExpenseStatus.PENDING_CASHIER, 15000, 0),
      {
        procurementOrderId: orderId,
        expenseType: TransportExpenseType.INTERNATIONAL_FREIGHT,
        amount: 120000,
        currency: 'KGS',
        amountKgs: 120000,
        paidAmountKgs: 0,
        status: TransportExpenseStatus.PAYMENT_POSTPONED,
      },
    ],
  });
  const kgLine = lines.find((row) => row.requestType === 'KYRGYZSTAN_DOMESTIC_TRANSPORT');
  if (!kgLine) throw new Error('7. kyrgyzstan line missing');
  assertClose(kgLine.approvedAmountKgs, 15000, '7. line shows approved kgs');
  assertClose(kgLine.paidAmountKgs, 0, '7. line shows zero paid');
  assertClose(kgLine.remainingAmountKgs, 15000, '7. line shows remaining');
  if (kgLine.approvalStatus !== 'APPROVED') throw new Error('7. approval APPROVED');
  if (kgLine.paymentStatus !== 'UNPAID') throw new Error('7. payment UNPAID');
  if (!kgLine.includedInLandedCost) throw new Error('7. included in landed cost');

  const totalApproved =
    lines.filter((row) => row.includedInLandedCost).reduce((sum, row) => sum + row.approvedAmountKgs, 0);
  assertClose(totalApproved, 800000.04 + 15000 + 120000, '18. total approved import expenses');
}

console.log('approved-unpaid-import-expense-cost.util.test.ts passed');
