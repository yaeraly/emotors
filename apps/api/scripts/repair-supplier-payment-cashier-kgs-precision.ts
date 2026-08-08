/**
 * Idempotent repair: align PENDING_CASHIER Supplier Payment requests with authoritative
 * remaining KGS/CNY after high-precision settlement math.
 *
 * Does NOT modify ACTIVE/confirmed ledger-posted payments.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-supplier-payment-cashier-kgs-precision.ts
 *   npx tsx apps/api/scripts/repair-supplier-payment-cashier-kgs-precision.ts --apply
 */
import { PrismaClient, ProcurementSupplierPaymentStatus } from '@prisma/client';
import {
  isSupplierCashierRequestKgsPrecisionDrift,
  resolveSupplierPaymentMonetaryBalance,
  resolveSupplierPayRemainderInstruction,
} from '../src/procurement/supplier-payment-balance.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const payments = await prisma.procurementSupplierPayment.findMany({
    where: {
      status: {
        in: [
          ProcurementSupplierPaymentStatus.PENDING_CASHIER,
          ProcurementSupplierPaymentStatus.RETURNED,
          ProcurementSupplierPaymentStatus.DRAFT,
        ],
      },
      procurementOrder: { deletedAt: null, invoiceSentToAccountantAt: { not: null } },
    },
    select: {
      id: true,
      sequenceNumber: true,
      amountYuan: true,
      exchangeRate: true,
      amountKgs: true,
      calculatedAmountKgs: true,
      approvedAmountKgs: true,
      status: true,
      ledgerEntryId: true,
      procurementOrder: {
        select: {
          id: true,
          orderNumber: true,
          totalYuan: true,
          defaultYuanRate: true,
          supplierPayments: {
            select: {
              id: true,
              amountYuan: true,
              exchangeRate: true,
              amountKgs: true,
              actualPaidKgs: true,
              approvedAmountKgs: true,
              status: true,
            },
          },
        },
      },
    },
  });

  let affected = 0;
  let audited = 0;
  for (const payment of payments) {
    const order = payment.procurementOrder;
    if (!order) continue;

    // Never rewrite a request that already has a posted ledger entry.
    if (payment.ledgerEntryId) continue;

    const paymentInputs = order.supplierPayments
      .filter((row) => row.id !== payment.id)
      .map((row) => ({
        amountYuan: Number(row.amountYuan),
        exchangeRate: Number(row.exchangeRate),
        amountKgs: Number(row.amountKgs),
        actualPaidKgs: row.actualPaidKgs != null ? Number(row.actualPaidKgs) : null,
        approvedAmountKgs: Number(row.approvedAmountKgs ?? row.amountKgs),
        status: row.status,
      }));
    const exchangeRate =
      Number(payment.exchangeRate || 0) > 0
        ? Number(payment.exchangeRate)
        : Number(order.defaultYuanRate || 0);
    if (!(exchangeRate > 0)) continue;

    const balance = resolveSupplierPaymentMonetaryBalance({
      totalYuan: Number(order.totalYuan),
      exchangeRate,
      payments: paymentInputs,
    });
    const expectedTotalKgs = balance.obligationKgs;
    const actualConfirmedKgs = balance.confirmedPaidKgs;
    const difference = Math.round((expectedTotalKgs - actualConfirmedKgs - Number(payment.approvedAmountKgs ?? payment.amountKgs ?? 0)) * 100) / 100;

    const approvedAmountKgs = Number(payment.approvedAmountKgs ?? payment.amountKgs ?? 0);
    const instruction = resolveSupplierPayRemainderInstruction({
      remainingCny: balance.remainingCny,
      exchangeRate,
      remainingKgs: balance.remainingKgs,
    });

    const kgsDrift = isSupplierCashierRequestKgsPrecisionDrift({
      approvedAmountKgs,
      authoritativeRemainingKgs: instruction.amountKgs,
    });
    const cnyDrift =
      Math.abs(Number(payment.amountYuan) - instruction.amountYuan) > 0.00000001 &&
      Math.abs(approvedAmountKgs - instruction.amountKgs) <= 0.05;

    audited += 1;
    if (!kgsDrift && !cnyDrift) continue;

    affected += 1;
    console.log(
      JSON.stringify({
        supplierPaymentId: payment.id,
        paymentNumber: `PAY-${payment.sequenceNumber}`,
        orderNumber: order.orderNumber,
        status: payment.status,
        totalCny: Number(order.totalYuan),
        paymentRate: exchangeRate,
        paymentKgsAmount: approvedAmountKgs,
        storedCnyEquivalent: Number(payment.amountYuan),
        expectedKgsTotal: expectedTotalKgs,
        actualConfirmedKgs,
        expectedRemainingKgs: instruction.amountKgs,
        expectedRemainingCny: instruction.amountYuan,
        difference,
        oldApprovedAmountKgs: approvedAmountKgs,
        newApprovedAmountKgs: instruction.amountKgs,
        oldAmountYuan: Number(payment.amountYuan),
        newAmountYuan: instruction.amountYuan,
      }),
    );

    if (apply) {
      await prisma.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          amountYuan: instruction.amountYuan,
          approvedAmountKgs: instruction.amountKgs,
          calculatedAmountKgs: instruction.amountKgs,
          amountKgs: instruction.amountKgs,
        },
      });
    }
  }

  console.log(
    JSON.stringify({
      scanned: payments.length,
      audited,
      affected,
      mode: apply ? 'apply' : 'dry-run',
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
