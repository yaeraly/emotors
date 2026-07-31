/**
 * Idempotent repair: realign branch purchase request line costs and linked
 * distribution order totals with authoritative FIFO allocation costs.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-branch-purchase-request-costs.ts [--request-number=BPR-...] [--apply]
 */
import { PrismaClient } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';
import { resolveBranchPurchaseFifoLineCost } from '../src/operations/branch-purchase-fifo-cost.util';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import type { PrismaService } from '../src/prisma/prisma.service';

type Args = { requestNumber?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const requestArg = argv.find((a) => a.startsWith('--request-number='));
  return {
    requestNumber: requestArg ? requestArg.slice('--request-number='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const pricingFifoService = new PricingFifoService(prisma as unknown as PrismaService);

  const requests = await prisma.branchPurchaseRequest.findMany({
    where: {
      deletedAt: null,
      ...(args.requestNumber ? { requestNumber: args.requestNumber } : {}),
    },
    include: {
      items: true,
      branch: { select: { branchType: true, hqToBranchMarkupPercent: true } },
    },
    take: args.requestNumber ? 1 : 100,
    orderBy: { createdAt: 'asc' },
  });

  const repairs: Array<Record<string, unknown>> = [];

  for (const request of requests) {
    const warehouseId = request.assignedHqWarehouseId;
    if (!warehouseId) continue;

    await pricingFifoService.syncFifoBatchesFromHqStockMovements();

    const itemUpdates: Array<{
      itemId: string;
      productId: string;
      sku: string;
      oldUnitCost: number;
      correctUnitCost: number;
      oldTotal: number;
      correctTotal: number;
      difference: number;
      reason: string;
    }> = [];

    for (const item of request.items) {
      const quantity = item.approvedQuantity ?? item.quantity;
      if (quantity <= 0) continue;

      const fifoCost = await resolveBranchPurchaseFifoLineCost(pricingFifoService, prisma, {
        productId: item.productId,
        warehouseId,
        quantity,
        branchType: request.branch?.branchType,
        hqToBranchMarkupPercent: request.branch?.hqToBranchMarkupPercent,
        fallbackUnitCost: n(item.estimatedUnitCost),
        fallbackUnitPrice: n(item.resolvedBranchPriceKgs),
      });

      const oldTotal = roundDisplayMoney(n(item.estimatedLineProductCostKgs));
      const newTotal = fifoCost.estimatedLineProductCostKgs;
      if (Math.abs(newTotal - oldTotal) > 0.001) {
        itemUpdates.push({
          itemId: item.id,
          productId: item.productId,
          sku: item.sku,
          oldUnitCost: roundDisplayMoney(n(item.estimatedUnitCost)),
          correctUnitCost: quantity > 0 ? deriveDisplayUnitCost(newTotal, quantity) : 0,
          oldTotal,
          correctTotal: newTotal,
          difference: roundDisplayMoney(newTotal - oldTotal),
          reason: 'fifo_layer_line_total_not_unit_times_qty',
        });
      }
    }

    const oldOrderTotal = sumDisplayMoneyTotals(
      request.items.map((item) => {
        const quantity = item.approvedQuantity ?? item.quantity;
        return quantity > 0 ? n(item.estimatedLineProductCostKgs) : 0;
      }),
    );
    const newOrderTotal = sumDisplayMoneyTotals(
      request.items.map((item) => {
        const update = itemUpdates.find((row) => row.itemId === item.id);
        if (update) return Number(update.correctTotal);
        const quantity = item.approvedQuantity ?? item.quantity;
        return quantity > 0 ? n(item.estimatedLineProductCostKgs) : 0;
      }),
    );

    let distributionRepair: Record<string, unknown> | null = null;
    if (request.convertedOrderId) {
      const order = await prisma.branchDistributionOrder.findFirst({
        where: { id: request.convertedOrderId, deletedAt: null },
        include: {
          items: {
            include: {
              distributionFifoAllocations: {
                where: { status: { in: ['RESERVED', 'CONSUMED'] } },
              },
            },
          },
        },
      });
      if (order) {
        const fifoAllocationTotal = sumDisplayMoneyTotals(
          order.items.flatMap((row) =>
            row.distributionFifoAllocations.map((allocation) => n(allocation.totalCostKgs)),
          ),
        );
        const authoritativeOrderTotal =
          fifoAllocationTotal > 0
            ? fifoAllocationTotal
            : sumDisplayMoneyTotals(
                order.items.map((row) => {
                  const lineUpdate = itemUpdates.find((update) => update.sku === row.sku);
                  return lineUpdate ? lineUpdate.correctTotal : n(row.totalCost);
                }),
              );
        const oldDistributionTotal = roundDisplayMoney(n(order.totalCost));
        if (Math.abs(authoritativeOrderTotal - oldDistributionTotal) > 0.001) {
          distributionRepair = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            oldOrderTotal: oldDistributionTotal,
            newOrderTotal: authoritativeOrderTotal,
            difference: roundDisplayMoney(authoritativeOrderTotal - oldDistributionTotal),
          };
        }
      }
    }

    if (
      itemUpdates.length === 0 &&
      Math.abs(newOrderTotal - oldOrderTotal) <= 0.001 &&
      !distributionRepair
    ) {
      continue;
    }

    repairs.push({
      requestId: request.id,
      requestNumber: request.requestNumber,
      warehouseId,
      oldOrderTotal,
      newOrderTotal,
      difference: roundDisplayMoney(newOrderTotal - oldOrderTotal),
      itemUpdates,
      distributionRepair,
    });

    if (!args.apply) continue;

    await prisma.$transaction(async (tx) => {
      for (const update of itemUpdates) {
        const item = request.items.find((row) => row.id === update.itemId);
        if (!item) continue;
        const quantity = item.approvedQuantity ?? item.quantity;
        await tx.branchPurchaseRequestItem.update({
          where: { id: update.itemId },
          data: {
            estimatedLineProductCostKgs: update.correctTotal,
            estimatedUnitCost: update.correctUnitCost,
          },
        });
      }

      if (distributionRepair && request.convertedOrderId) {
        const order = await tx.branchDistributionOrder.findFirstOrThrow({
          where: { id: request.convertedOrderId },
          include: {
            items: {
              include: {
                distributionFifoAllocations: {
                  where: { status: { in: ['RESERVED', 'CONSUMED'] } },
                },
              },
            },
          },
        });

        for (const orderItem of order.items) {
          const allocationTotal = sumDisplayMoneyTotals(
            orderItem.distributionFifoAllocations.map((row) => n(row.totalCostKgs)),
          );
          const bprItem = request.items.find((row) => row.productId === orderItem.productId);
          const lineTotal =
            allocationTotal > 0
              ? allocationTotal
              : itemUpdates.find((row) => row.itemId === bprItem?.id)?.correctTotal ??
                n(bprItem?.estimatedLineProductCostKgs ?? orderItem.totalCost);
          const quantity = n(orderItem.quantity);
          await tx.branchDistributionOrderItem.update({
            where: { id: orderItem.id },
            data: {
              totalCost: lineTotal,
              unitCost: quantity > 0 ? deriveDisplayUnitCost(lineTotal, quantity) : 0,
              profit: roundDisplayMoney(n(orderItem.totalPrice) - lineTotal),
            },
          });
        }

        const refreshedItems = await tx.branchDistributionOrderItem.findMany({
          where: { orderId: order.id },
        });
        const totalAmount = sumDisplayMoneyTotals(refreshedItems.map((row) => n(row.totalPrice)));
        const totalCost = sumDisplayMoneyTotals(refreshedItems.map((row) => n(row.totalCost)));
        await tx.branchDistributionOrder.update({
          where: { id: order.id },
          data: {
            totalAmount,
            totalCost,
            totalProfit: roundDisplayMoney(totalAmount - totalCost),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: 'system',
          role: 'SYSTEM_ADMINISTRATOR',
          action: 'COST_RECONCILIATION_REPAIRED',
          entity: 'BranchPurchaseRequest',
          entityId: request.id,
          metadata: {
            branchPurchaseRequestNumber: request.requestNumber,
            shipmentId: null,
            warehouseId,
            oldOrderTotal,
            newOrderTotal,
            difference: roundDisplayMoney(newOrderTotal - oldOrderTotal),
            reason: 'Reconcile branch purchase request transfer cost with FIFO layer totals',
            correctedBy: 'repair-branch-purchase-request-costs',
            correctedAt: new Date().toISOString(),
            itemUpdates,
            distributionRepair,
          },
        },
      });
    });
  }

  console.log(
    JSON.stringify(
      {
        apply: args.apply,
        requestsChecked: requests.length,
        repairsFound: repairs.length,
        repairs,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
