/**
 * Idempotent repair: align active Supplier Payment cashier requests with authoritative KGS remaining.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-supplier-payment-cashier-kgs-precision.ts
 *   npx tsx apps/api/scripts/repair-supplier-payment-cashier-kgs-precision.ts --apply
 */
import { PrismaClient, ProcurementSupplierPaymentStatus } from '@prisma/client';
import {
  isSupplierCashierRequestKgsPrecisionDrift,
  resolveSupplierPaymentMonetaryBalance,
} from '../src/procurement/supplier-payment-balance.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const payments = await prisma.procurementSupplierPayment.findMany({
    where: {
      status: ProcurementSupplierPaymentStatus.PENDING_CASHIER,
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
      procurementOrder: {
        select: {
          id: true,
          orderNumber: true,
          totalYuan: true,
          defaultYuanRate: true,
          supplierPayments: {
            select: {
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
  for (const payment of payments) {
    const order = payment.procurementOrder;
    if (!order) continue;

    const paymentInputs = order.supplierPayments.map((row) => ({
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
      payments: paymentInputs.filter((row) => row.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER),
    });
    const approvedAmountKgs = Number(payment.approvedAmountKgs ?? payment.amountKgs ?? 0);
    if (
      !isSupplierCashierRequestKgsPrecisionDrift({
        approvedAmountKgs,
        authoritativeRemainingKgs: balance.remainingKgs,
      })
    ) {
      continue;
    }

    affected += 1;
    console.log(
      JSON.stringify({
        paymentId: payment.id,
        paymentNumber: `PAY-${payment.sequenceNumber}`,
        orderNumber: order.orderNumber,
        oldApprovedAmountKgs: approvedAmountKgs,
        newApprovedAmountKgs: balance.remainingKgs,
      }),
    );

    if (apply) {
      await prisma.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          approvedAmountKgs: balance.remainingKgs,
          calculatedAmountKgs: balance.remainingKgs,
          amountKgs: balance.remainingKgs,
        },
      });
    }
  }

  console.log(
    JSON.stringify({
      scanned: payments.length,
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
