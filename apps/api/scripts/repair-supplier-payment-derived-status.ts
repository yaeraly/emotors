/**
 * Idempotent repair: reconcile Supplier Payment derived totals/status with confirmed payments.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-supplier-payment-derived-status.ts
 *   npx tsx apps/api/scripts/repair-supplier-payment-derived-status.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  isSupplierPaymentStatusInconsistentWithBalance,
  resolveReconciledSupplierPaymentLedgerStatus,
  resolveSupplierPaymentMonetaryBalance,
} from '../src/procurement/supplier-payment-balance.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const orders = await prisma.procurementOrder.findMany({
    where: {
      deletedAt: null,
      invoiceSentToAccountantAt: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      totalYuan: true,
      totalPaidYuan: true,
      totalPaidKgs: true,
      remainingYuan: true,
      defaultYuanRate: true,
      weightedAverageYuanRate: true,
      supplierPaymentStatus: true,
      invoiceSentToAccountantAt: true,
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
  });

  let affected = 0;
  for (const order of orders) {
    const paymentInputs = order.supplierPayments.map((payment) => ({
      amountYuan: Number(payment.amountYuan),
      exchangeRate: Number(payment.exchangeRate),
      amountKgs: Number(payment.amountKgs),
      actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
      approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
      status: payment.status,
    }));
    const exchangeRate =
      Number(order.defaultYuanRate || 0) > 0
        ? Number(order.defaultYuanRate)
        : paymentInputs
            .map((payment) => Number(payment.exchangeRate || 0))
            .filter((rate) => rate > 0)
            .at(-1) ?? 0;
    if (!(exchangeRate > 0)) continue;

    const balance = resolveSupplierPaymentMonetaryBalance({
      totalYuan: Number(order.totalYuan),
      exchangeRate,
      payments: paymentInputs,
    });
    const reconciledStatus = resolveReconciledSupplierPaymentLedgerStatus({
      totalYuan: Number(order.totalYuan),
      exchangeRate,
      payments: paymentInputs,
      invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
      previousStatus: order.supplierPaymentStatus,
    });

    const inconsistent =
      isSupplierPaymentStatusInconsistentWithBalance({
        supplierPaymentStatus: order.supplierPaymentStatus,
        balance,
      }) ||
      Math.abs(Number(order.totalPaidYuan ?? 0) - balance.confirmedPaidCny) > 0.009 ||
      Math.abs(Number(order.remainingYuan ?? 0) - balance.remainingCny) > 0.009 ||
      String(order.supplierPaymentStatus ?? '') !== String(reconciledStatus);

    if (!inconsistent) continue;

    affected += 1;
    console.log(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        oldStatus: order.supplierPaymentStatus,
        newStatus: reconciledStatus,
        oldPaidYuan: Number(order.totalPaidYuan ?? 0),
        newPaidYuan: balance.confirmedPaidCny,
        oldRemainingYuan: Number(order.remainingYuan ?? 0),
        newRemainingYuan: balance.remainingCny,
        newRemainingKgs: balance.remainingKgs,
      }),
    );

    if (apply) {
      await prisma.procurementOrder.update({
        where: { id: order.id },
        data: {
          totalPaidYuan: balance.confirmedPaidCny,
          totalPaidKgs: balance.confirmedPaidKgs,
          remainingYuan: balance.remainingCny,
          supplierPaymentStatus: reconciledStatus,
        },
      });
    }
  }

  console.log(
    JSON.stringify({
      scanned: orders.length,
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
