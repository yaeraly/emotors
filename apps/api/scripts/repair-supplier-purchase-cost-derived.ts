/**
 * Idempotent repair: reconcile weighted CNY rate and supplier purchase cost
 * with confirmed Supplier Payment transactions.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-supplier-purchase-cost-derived.ts
 *   npx tsx apps/api/scripts/repair-supplier-purchase-cost-derived.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  mapSupplierPaymentsForCosting,
  resolveAuthoritativeSupplierPurchaseCost,
} from '../src/procurement/procurement-cost.util';
import { summarizeSupplierPayments } from '../src/procurement/supplier-payment.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const orders = await prisma.procurementOrder.findMany({
    where: {
      deletedAt: null,
      supplierPayments: { some: {} },
    },
    select: {
      id: true,
      orderNumber: true,
      totalYuan: true,
      defaultYuanRate: true,
      totalPaidYuan: true,
      totalPaidKgs: true,
      weightedAverageYuanRate: true,
      estimatedSupplierCostKgs: true,
      supplierPaymentStatus: true,
      invoiceSentToAccountantAt: true,
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
  });

  let affected = 0;
  for (const order of orders) {
    const paymentInputs = mapSupplierPaymentsForCosting(order.supplierPayments);
    const summary = summarizeSupplierPayments(paymentInputs, Number(order.totalYuan), {
      invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
      previousStatus: order.supplierPaymentStatus,
    });
    const authoritative = resolveAuthoritativeSupplierPurchaseCost({
      totalProcurementYuan: Number(order.totalYuan),
      payments: paymentInputs,
      estimatedYuanRate: Number(order.defaultYuanRate ?? 0),
    });

    const storedRate =
      order.weightedAverageYuanRate != null ? Number(order.weightedAverageYuanRate) : null;
    const computedRate = authoritative.weightedAverageYuanRate;
    const storedCost = Number(order.estimatedSupplierCostKgs ?? 0);
    const computedCost = authoritative.authoritativeSupplierPurchaseCostKgs;

    const rateMismatch =
      computedRate != null &&
      (storedRate == null || Math.abs(storedRate - computedRate) > 0.0001);
    const rateShouldClear = computedRate == null && storedRate != null;
    const costMismatch = Math.abs(storedCost - computedCost) > 0.05;
    const paidYuanMismatch =
      Math.abs(Number(order.totalPaidYuan ?? 0) - summary.totalPaidYuan) > 0.009;
    const paidKgsMismatch =
      Math.abs(Number(order.totalPaidKgs ?? 0) - summary.totalPaidKgs) > 0.05;

    if (!rateMismatch && !rateShouldClear && !costMismatch && !paidYuanMismatch && !paidKgsMismatch) {
      continue;
    }

    affected += 1;
    console.log(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        oldWeightedRate: storedRate,
        newWeightedRate: computedRate,
        oldEstimatedSupplierCostKgs: storedCost,
        newEstimatedSupplierCostKgs: computedCost,
        oldTotalPaidYuan: Number(order.totalPaidYuan ?? 0),
        newTotalPaidYuan: summary.totalPaidYuan,
        oldTotalPaidKgs: Number(order.totalPaidKgs ?? 0),
        newTotalPaidKgs: summary.totalPaidKgs,
        isFullyPaid: authoritative.isFullyPaid,
      }),
    );

    if (apply) {
      await prisma.procurementOrder.update({
        where: { id: order.id },
        data: {
          weightedAverageYuanRate: computedRate,
          estimatedSupplierCostKgs: computedCost,
          totalPaidYuan: summary.totalPaidYuan,
          totalPaidKgs: summary.totalPaidKgs,
          remainingYuan: summary.remainingYuan,
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
