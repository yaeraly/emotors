/**
 * Idempotent repair: realign Branch receipt/FIFO/balance values to exact HQ FIFO
 * consumed allocation totals (fixes unit×qty drift such as 914369.26 vs 914369.80).
 *
 * Dry-run by default.
 *
 * Usage:
 *   cd apps/api
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts --branch-request-number=BPR-...
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts --distribution-order-id=...
 *   node --import tsx scripts/repair-branch-inventory-cost-parity.ts --apply
 */
import { PrismaClient, StockMovementStatus, StockMovementType } from '@prisma/client';
import { syncInventoryBalanceValuationFromFifoRemainingInTx } from '../src/inventory/inventory-authoritative-value.util';
import { buildBranchReceiveLinesFromHqAllocations } from '../src/pricing/pricing-fifo-branch-receive.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';

type Args = {
  branchRequestNumber?: string;
  distributionOrderId?: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const bpr = argv.find((a) => a.startsWith('--branch-request-number='));
  const order = argv.find((a) => a.startsWith('--distribution-order-id='));
  return {
    branchRequestNumber: bpr ? bpr.slice('--branch-request-number='.length) : undefined,
    distributionOrderId: order ? order.slice('--distribution-order-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const repairs: Array<Record<string, unknown>> = [];

  let distributionOrderIds: string[] = [];
  if (args.distributionOrderId) {
    distributionOrderIds = [args.distributionOrderId];
  } else if (args.branchRequestNumber) {
    const request = await prisma.branchPurchaseRequest.findFirst({
      where: { requestNumber: args.branchRequestNumber, deletedAt: null },
      select: { id: true, convertedOrderId: true },
    });
    if (!request?.convertedOrderId) {
      throw new Error(`Branch purchase request not found or not converted: ${args.branchRequestNumber}`);
    }
    distributionOrderIds = [request.convertedOrderId];
  } else {
    // Auto-detect orders where Branch IN movement totals drift from HQ allocation totals.
    const allocations = await prisma.distributionFifoAllocation.findMany({
      where: { status: 'CONSUMED' },
      select: {
        id: true,
        distributionOrderId: true,
        distributionOrderItemId: true,
        fifoBatchId: true,
        quantity: true,
        unitCostKgs: true,
        totalCostKgs: true,
      },
    });
    const byOrder = new Map<string, typeof allocations>();
    for (const row of allocations) {
      const list = byOrder.get(row.distributionOrderId) ?? [];
      list.push(row);
      byOrder.set(row.distributionOrderId, list);
    }
    for (const [orderId, rows] of byOrder) {
      const expected = sumDisplayMoneyTotals(rows.map((row) => Number(row.totalCostKgs)));
      const movements = await prisma.stockMovement.findMany({
        where: {
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: { in: rows.map((row) => row.id) },
          type: StockMovementType.IN,
          status: StockMovementStatus.ACTIVE,
        },
        select: { totalCostKgs: true },
      });
      if (!movements.length) continue;
      const actual = sumDisplayMoneyTotals(movements.map((row) => Number(row.totalCostKgs ?? 0)));
      if (roundDisplayMoney(expected - actual) !== 0) {
        distributionOrderIds.push(orderId);
      }
    }
  }

  for (const orderId of distributionOrderIds) {
    const order = await prisma.branchDistributionOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: true,
        branch: { select: { id: true, name: true } },
        destinationWarehouse: { select: { id: true, name: true } },
      },
    });
    if (!order) continue;

    const allocations = await prisma.distributionFifoAllocation.findMany({
      where: { distributionOrderId: order.id, status: 'CONSUMED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    for (const orderItem of order.items) {
      const itemAllocations = allocations.filter((row) => row.distributionOrderItemId === orderItem.id);
      if (!itemAllocations.length) continue;
      const acceptedQuantity = itemAllocations.reduce((sum, row) => sum + row.quantity, 0);
      const receiveLines = buildBranchReceiveLinesFromHqAllocations(
        itemAllocations.map((row) => ({
          id: row.id,
          fifoBatchId: row.fifoBatchId,
          quantity: row.quantity,
          unitCostKgs: Number(row.unitCostKgs),
          totalCostKgs: Number(row.totalCostKgs),
        })),
        acceptedQuantity,
        Number(orderItem.transportCostPerUnit ?? 0),
      );

      for (const line of receiveLines) {
        const movement = await prisma.stockMovement.findFirst({
          where: {
            referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
            referenceId: line.allocationId,
            type: StockMovementType.IN,
            status: StockMovementStatus.ACTIVE,
          },
        });
        if (!movement) continue;

        const oldTotal = roundDisplayMoney(movement.totalCostKgs ?? 0);
        const correctTotal = roundDisplayMoney(line.lineTotalCostKgs);
        const oldUnit = roundDisplayMoney(movement.unitCostKgs ?? 0);
        const correctUnit = deriveDisplayUnitCost(correctTotal, line.quantity);
        const difference = roundDisplayMoney(correctTotal - oldTotal);
        if (difference === 0) continue;

        const product = await prisma.product.findUnique({
          where: { id: movement.productId },
          select: { sku: true },
        });
        const fifo = await prisma.fifoInventoryBatch.findFirst({
          where: { stockMovementId: movement.id },
          select: { id: true },
        });

        repairs.push({
          recordType: 'branch_stock_movement',
          recordId: movement.id,
          branchId: order.branchId,
          warehouseId: order.destinationWarehouseId,
          distributionOrderId: order.id,
          productId: movement.productId,
          sku: product?.sku ?? null,
          fifoLayerId: fifo?.id ?? null,
          hqFifoLayerId: line.hqFifoLayerId,
          oldUnitCost: oldUnit,
          oldTotalCost: oldTotal,
          correctUnitCost: correctUnit,
          correctTotalCost: correctTotal,
          difference,
          reason: 'branch_receive_used_rounded_unit_times_qty_instead_of_hq_allocation_total',
        });

        if (args.apply) {
          await prisma.$transaction(async (tx) => {
            await tx.stockMovement.update({
              where: { id: movement.id },
              data: {
                unitCostKgs: correctUnit,
                totalCostKgs: correctTotal,
              },
            });
            if (fifo) {
              await tx.fifoInventoryBatch.update({
                where: { id: fifo.id },
                data: { unitCostKgs: correctUnit },
              });
            }
            await syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
              warehouseId: movement.warehouseId,
              productId: movement.productId,
              branchId: movement.branchId,
            });
            await tx.auditLog.create({
              data: {
                userId: null,
                role: 'SYSTEM',
                action: 'BRANCH_INVENTORY_COST_PARITY_REPAIRED',
                entity: 'StockMovement',
                entityId: movement.id,
                metadata: {
                  branchId: order.branchId,
                  warehouseId: order.destinationWarehouseId,
                  distributionOrderId: order.id,
                  productId: movement.productId,
                  fifoLayerId: fifo?.id ?? null,
                  oldValue: oldTotal,
                  correctedValue: correctTotal,
                  difference,
                  reason: 'branch_receive_used_rounded_unit_times_qty_instead_of_hq_allocation_total',
                  repairedBy: 'repair-branch-inventory-cost-parity',
                  repairedAt: new Date().toISOString(),
                },
              },
            });
            if (fifo) {
              await tx.auditLog.create({
                data: {
                  userId: null,
                  role: 'SYSTEM',
                  action: 'BRANCH_FIFO_VALUE_RECONCILED',
                  entity: 'FifoInventoryBatch',
                  entityId: fifo.id,
                  metadata: {
                    branchId: order.branchId,
                    warehouseId: order.destinationWarehouseId,
                    distributionOrderId: order.id,
                    productId: movement.productId,
                    fifoLayerId: fifo.id,
                    oldValue: oldTotal,
                    correctedValue: correctTotal,
                    difference,
                    reason: 'branch_receive_used_rounded_unit_times_qty_instead_of_hq_allocation_total',
                    repairedBy: 'repair-branch-inventory-cost-parity',
                    repairedAt: new Date().toISOString(),
                  },
                },
              });
            }
          });
        }
      }
    }
  }

  const totalDifference = roundDisplayMoney(
    repairs.reduce((sum, row) => sum + Number(row.difference ?? 0), 0),
  );

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        filters: {
          branchRequestNumber: args.branchRequestNumber ?? null,
          distributionOrderId: args.distributionOrderId ?? null,
        },
        distributionOrderIds,
        repairSummary: {
          rows: repairs.length,
          totalDifferenceKgs: totalDifference,
        },
        repairs,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
