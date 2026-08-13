import {
  PrismaClient,
  StockMovementStatus,
  StockMovementType,
} from '@prisma/client';
import { syncInventoryBalanceValuationFromFifoRemainingInTx } from '../inventory/inventory-authoritative-value.util';
import { buildBranchReceiveLinesFromHqAllocations } from './pricing-fifo-branch-receive.util';
import {
  allocateProportionalCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';

function remainingLayerTotal(
  originalTotal: number,
  initialQuantity: number,
  remainingQuantity: number,
): number {
  const initial = Math.max(0, Math.floor(Number(initialQuantity)));
  const remaining = Math.max(0, Math.floor(Number(remainingQuantity)));
  if (remaining <= 0 || initial <= 0 || originalTotal <= 0) return 0;
  if (remaining >= initial) return roundDisplayMoney(originalTotal);
  return roundDisplayMoney(allocateProportionalCost(originalTotal, initial, remaining));
}

export type RepairBranchInventoryCostParityArgs = {
  branchRequestNumber?: string;
  distributionOrderId?: string;
  distributionOrderNumber?: string;
  apply: boolean;
};

export type RepairRow = {
  recordType: string;
  recordId: string;
  productId: string;
  SKU: string | null;
  quantity: number;
  oldUnitCost: number;
  oldTotalCost: number;
  correctUnitCost: number;
  correctTotalCost: number;
  difference: number;
  reason: string;
  branchId?: string;
  warehouseId?: string;
  distributionOrderId?: string;
  branchPurchaseRequestId?: string | null;
  fifoLayerId?: string | null;
  hqFifoLayerId?: string | null;
  distributionOrderItemId?: string | null;
};

export type ReconciliationRow = {
  productId: string;
  SKU: string | null;
  productName: string | null;
  shipmentItemId: string | null;
  receivedQuantity: number;
  hqFifoLayerId: string;
  hqOriginalLayerTotal: number;
  hqConsumedQuantity: number;
  hqConsumedTotal: number;
  distributionOrderItemId: string;
  transferUnitCost: number;
  transferLineTotal: number;
  branchReceiptItemId: string | null;
  branchFifoLayerId: string | null;
  branchFifoOriginalQuantity: number;
  branchFifoOriginalTotal: number;
  branchFifoRemainingQuantity: number;
  branchFifoRemainingTotal: number;
  branchInventoryBalanceValue: number | null;
  inventoryCountShortageValue: number;
  difference: number;
};

export type RepairResult = {
  mode: 'APPLY' | 'DRY_RUN';
  filters: {
    branchRequestNumber: string | null;
    distributionOrderId: string | null;
    distributionOrderNumber: string | null;
  };
  distributionOrderIds: string[];
  repairSummary: {
    rows: number;
    movementDifferenceKgs: number;
    reconciliationLines: number;
    reconciliationDifferenceKgs: number;
  };
  repairs: Array<{
    recordType: string;
    recordId: string;
    productId: string;
    SKU: string | null;
    quantity: number;
    oldUnitCost: number;
    oldTotalCost: number;
    correctUnitCost: number;
    correctTotalCost: number;
    difference: number;
    reason: string;
  }>;
  productByProductReconciliation: ReconciliationRow[];
};

async function computeMovementDriftKgsForOrders(
  prisma: PrismaClient,
  distributionOrderIds: string[],
): Promise<number> {
  let total = 0;
  for (const orderId of distributionOrderIds) {
    const allocations = await prisma.distributionFifoAllocation.findMany({
      where: { distributionOrderId: orderId, status: 'CONSUMED' },
      select: { id: true, totalCostKgs: true },
    });
    for (const allocation of allocations) {
      const movement = await prisma.stockMovement.findFirst({
        where: {
          referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
          referenceId: allocation.id,
          type: StockMovementType.IN,
          status: StockMovementStatus.ACTIVE,
        },
        select: { totalCostKgs: true },
      });
      if (!movement) continue;
      const expected = roundDisplayMoney(Number(allocation.totalCostKgs));
      const actual = roundDisplayMoney(movement.totalCostKgs ?? 0);
      total = roundDisplayMoney(total + roundDisplayMoney(expected - actual));
    }
  }
  return total;
}

export function parseRepairBranchInventoryCostParityArgs(
  argv: string[],
): RepairBranchInventoryCostParityArgs {
  const bpr = argv.find((a) => a.startsWith('--branch-request-number='));
  const orderId = argv.find((a) => a.startsWith('--distribution-order-id='));
  const orderNumber = argv.find((a) => a.startsWith('--distribution-order-number='));
  return {
    branchRequestNumber: bpr ? bpr.slice('--branch-request-number='.length) : undefined,
    distributionOrderId: orderId ? orderId.slice('--distribution-order-id='.length) : undefined,
    distributionOrderNumber: orderNumber
      ? orderNumber.slice('--distribution-order-number='.length)
      : undefined,
    apply: argv.includes('--apply'),
  };
}

export async function runBranchInventoryCostParityRepair(
  prisma: PrismaClient,
  args: RepairBranchInventoryCostParityArgs,
): Promise<RepairResult> {
  const repairs: RepairRow[] = [];
  const reconciliation: ReconciliationRow[] = [];

  let distributionOrderIds: string[] = [];
  if (args.distributionOrderId) {
    distributionOrderIds = [args.distributionOrderId];
  } else if (args.distributionOrderNumber) {
    const order = await prisma.branchDistributionOrder.findFirst({
      where: { orderNumber: args.distributionOrderNumber, deletedAt: null },
      select: { id: true },
    });
    if (!order) {
      throw new Error(`Distribution order not found: ${args.distributionOrderNumber}`);
    }
    distributionOrderIds = [order.id];
  } else if (args.branchRequestNumber) {
    const request = await prisma.branchPurchaseRequest.findFirst({
      where: { requestNumber: args.branchRequestNumber, deletedAt: null },
      select: { id: true, convertedOrderId: true },
    });
    if (!request?.convertedOrderId) {
      throw new Error(
        `Branch purchase request not found or not converted: ${args.branchRequestNumber}`,
      );
    }
    distributionOrderIds = [request.convertedOrderId];
  } else {
    const allocations = await prisma.distributionFifoAllocation.findMany({
      where: { status: 'CONSUMED' },
      select: {
        id: true,
        distributionOrderId: true,
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

    const branchRequest = await prisma.branchPurchaseRequest.findFirst({
      where: { convertedOrderId: order.id, deletedAt: null },
      select: { id: true, requestNumber: true },
    });

    const allocations = await prisma.distributionFifoAllocation.findMany({
      where: { distributionOrderId: order.id, status: 'CONSUMED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const productsNeedingBalanceSync = new Set<string>();

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

      const authoritativeItemTotal = sumDisplayMoneyTotals(
        receiveLines.map((line) => line.lineTotalCostKgs),
      );
      const oldOrderItemTotal = roundDisplayMoney(orderItem.totalCost);
      const orderItemDifference = roundDisplayMoney(authoritativeItemTotal - oldOrderItemTotal);
      if (
        orderItemDifference !== 0 &&
        Number(orderItem.transportCostPerUnit ?? 0) === 0 &&
        Number(orderItem.transportExpenseAllocation ?? 0) === 0
      ) {
        const product = await prisma.product.findUnique({
          where: { id: orderItem.productId },
          select: { sku: true },
        });
        repairs.push({
          recordType: 'distribution_order_item',
          recordId: orderItem.id,
          productId: orderItem.productId,
          SKU: product?.sku ?? orderItem.sku ?? null,
          quantity: acceptedQuantity,
          oldUnitCost: roundDisplayMoney(orderItem.unitCost),
          oldTotalCost: oldOrderItemTotal,
          correctUnitCost: deriveDisplayUnitCost(authoritativeItemTotal, acceptedQuantity),
          correctTotalCost: authoritativeItemTotal,
          difference: orderItemDifference,
          reason: 'distribution_order_item_total_drifted_from_hq_fifo_consumed_total',
          branchId: order.branchId,
          warehouseId: order.destinationWarehouseId,
          distributionOrderId: order.id,
          branchPurchaseRequestId: branchRequest?.id ?? null,
          distributionOrderItemId: orderItem.id,
        });
        if (args.apply) {
          await prisma.branchDistributionOrderItem.update({
            where: { id: orderItem.id },
            data: {
              unitCost: deriveDisplayUnitCost(authoritativeItemTotal, acceptedQuantity),
              totalCost: authoritativeItemTotal,
            },
          });
        }
      }

      for (const line of receiveLines) {
        const allocation = itemAllocations.find((row) => row.id === line.allocationId);
        const hqLayer = await prisma.fifoInventoryBatch.findUnique({
          where: { id: line.hqFifoLayerId },
          select: {
            id: true,
            initialQuantity: true,
            remainingQuantity: true,
            unitCostKgs: true,
            stockMovementId: true,
          },
        });
        let hqOriginalLayerTotal = roundDisplayMoney(Number(allocation?.totalCostKgs ?? 0));
        if (hqLayer?.stockMovementId) {
          const hqMovement = await prisma.stockMovement.findUnique({
            where: { id: hqLayer.stockMovementId },
            select: { totalCostKgs: true },
          });
          if (hqMovement?.totalCostKgs != null) {
            hqOriginalLayerTotal = roundDisplayMoney(hqMovement.totalCostKgs);
          }
        }

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

        const product = await prisma.product.findUnique({
          where: { id: movement.productId },
          select: { sku: true, name: true },
        });
        const fifo = await prisma.fifoInventoryBatch.findFirst({
          where: { stockMovementId: movement.id },
          select: {
            id: true,
            initialQuantity: true,
            remainingQuantity: true,
            unitCostKgs: true,
          },
        });

        const balance = await prisma.inventoryBalance.findFirst({
          where: {
            warehouseId: movement.warehouseId,
            productId: movement.productId,
          },
          select: { id: true, totalValueKgs: true, quantity: true, averageCostKgs: true },
        });

        const remainingQty = fifo ? Math.max(0, Math.floor(Number(fifo.remainingQuantity))) : 0;
        const branchFifoRemainingTotalBefore = remainingLayerTotal(
          oldTotal,
          fifo ? Number(fifo.initialQuantity) : line.quantity,
          remainingQty,
        );

        reconciliation.push({
          productId: movement.productId,
          SKU: product?.sku ?? null,
          productName: product?.name ?? orderItem.productName ?? null,
          shipmentItemId: orderItem.id,
          receivedQuantity: line.quantity,
          hqFifoLayerId: line.hqFifoLayerId,
          hqOriginalLayerTotal,
          hqConsumedQuantity: line.quantity,
          hqConsumedTotal: roundDisplayMoney(Number(allocation?.totalCostKgs ?? line.lineTotalCostKgs)),
          distributionOrderItemId: orderItem.id,
          transferUnitCost: line.transferUnitCostKgs,
          transferLineTotal: roundDisplayMoney(Number(allocation?.totalCostKgs ?? 0)),
          branchReceiptItemId: movement.id,
          branchFifoLayerId: fifo?.id ?? null,
          branchFifoOriginalQuantity: fifo ? Number(fifo.initialQuantity) : line.quantity,
          branchFifoOriginalTotal: oldTotal,
          branchFifoRemainingQuantity: remainingQty,
          branchFifoRemainingTotal: branchFifoRemainingTotalBefore,
          branchInventoryBalanceValue:
            balance?.totalValueKgs != null ? roundDisplayMoney(balance.totalValueKgs) : null,
          inventoryCountShortageValue: -branchFifoRemainingTotalBefore,
          difference,
        });

        if (difference === 0) continue;

        productsNeedingBalanceSync.add(movement.productId);

        repairs.push({
          recordType: 'branch_stock_movement',
          recordId: movement.id,
          productId: movement.productId,
          SKU: product?.sku ?? null,
          quantity: line.quantity,
          oldUnitCost: oldUnit,
          oldTotalCost: oldTotal,
          correctUnitCost: correctUnit,
          correctTotalCost: correctTotal,
          difference,
          reason: 'branch_receive_used_rounded_unit_times_qty_instead_of_hq_allocation_total',
          branchId: order.branchId,
          warehouseId: order.destinationWarehouseId,
          distributionOrderId: order.id,
          branchPurchaseRequestId: branchRequest?.id ?? null,
          fifoLayerId: fifo?.id ?? null,
          hqFifoLayerId: line.hqFifoLayerId,
          distributionOrderItemId: orderItem.id,
        });

        if (fifo) {
          repairs.push({
            recordType: 'branch_fifo_layer',
            recordId: fifo.id,
            productId: movement.productId,
            SKU: product?.sku ?? null,
            quantity: line.quantity,
            oldUnitCost: roundDisplayMoney(fifo.unitCostKgs),
            oldTotalCost: oldTotal,
            correctUnitCost: correctUnit,
            correctTotalCost: correctTotal,
            difference,
            reason: 'branch_fifo_total_derived_from_rounded_unit_instead_of_receipt_line_total',
            branchId: order.branchId,
            warehouseId: order.destinationWarehouseId,
            distributionOrderId: order.id,
            branchPurchaseRequestId: branchRequest?.id ?? null,
            fifoLayerId: fifo.id,
            hqFifoLayerId: line.hqFifoLayerId,
            distributionOrderItemId: orderItem.id,
          });
        }

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
            const balanceBefore = await tx.inventoryBalance.findFirst({
              where: {
                warehouseId: movement.warehouseId,
                productId: movement.productId,
              },
              select: { id: true, totalValueKgs: true, averageCostKgs: true, quantity: true },
            });
            await syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
              warehouseId: movement.warehouseId,
              productId: movement.productId,
              branchId: movement.branchId,
            });
            const balanceAfter = await tx.inventoryBalance.findFirst({
              where: {
                warehouseId: movement.warehouseId,
                productId: movement.productId,
              },
              select: { id: true, totalValueKgs: true, averageCostKgs: true, quantity: true },
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
                  branchPurchaseRequestId: branchRequest?.id ?? null,
                  distributionOrderId: order.id,
                  distributionOrderNumber: order.orderNumber,
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
                    branchPurchaseRequestId: branchRequest?.id ?? null,
                    distributionOrderId: order.id,
                    distributionOrderNumber: order.orderNumber,
                    productId: movement.productId,
                    fifoLayerId: fifo.id,
                    oldValue: oldTotal,
                    correctedValue: correctTotal,
                    difference,
                    reason: 'branch_fifo_total_derived_from_rounded_unit_instead_of_receipt_line_total',
                    repairedBy: 'repair-branch-inventory-cost-parity',
                    repairedAt: new Date().toISOString(),
                  },
                },
              });
            }
            if (balanceBefore && balanceAfter) {
              const oldBalanceTotal = roundDisplayMoney(balanceBefore.totalValueKgs ?? 0);
              const newBalanceTotal = roundDisplayMoney(balanceAfter.totalValueKgs ?? 0);
              if (oldBalanceTotal !== newBalanceTotal) {
                await tx.auditLog.create({
                  data: {
                    userId: null,
                    role: 'SYSTEM',
                    action: 'BRANCH_INVENTORY_BALANCE_RECALCULATED',
                    entity: 'InventoryBalance',
                    entityId: balanceAfter.id,
                    metadata: {
                      branchId: order.branchId,
                      warehouseId: order.destinationWarehouseId,
                      branchPurchaseRequestId: branchRequest?.id ?? null,
                      distributionOrderId: order.id,
                      distributionOrderNumber: order.orderNumber,
                      productId: movement.productId,
                      fifoLayerId: fifo?.id ?? null,
                      oldValue: oldBalanceTotal,
                      correctedValue: newBalanceTotal,
                      difference: roundDisplayMoney(newBalanceTotal - oldBalanceTotal),
                      quantity: Number(balanceAfter.quantity),
                      averageCostKgs: Number(balanceAfter.averageCostKgs ?? 0),
                      reason: 'recomputed_from_active_branch_fifo_remaining_totals',
                      repairedBy: 'repair-branch-inventory-cost-parity',
                      repairedAt: new Date().toISOString(),
                    },
                  },
                });
              }
            }
          });
        }
      }
    }

    if (!args.apply) {
      for (const productId of productsNeedingBalanceSync) {
        const balance = await prisma.inventoryBalance.findFirst({
          where: {
            warehouseId: order.destinationWarehouseId,
            productId,
          },
        });
        if (!balance) continue;
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { sku: true },
        });
        const drifted = repairs.filter(
          (row) => row.productId === productId && row.recordType === 'branch_stock_movement',
        );
        const delta = sumDisplayMoneyTotals(drifted.map((row) => row.difference));
        if (delta === 0) continue;
        repairs.push({
          recordType: 'branch_inventory_balance',
          recordId: balance.id,
          productId,
          SKU: product?.sku ?? null,
          quantity: Number(balance.quantity),
          oldUnitCost: roundDisplayMoney(balance.averageCostKgs ?? 0),
          oldTotalCost: roundDisplayMoney(balance.totalValueKgs ?? 0),
          correctUnitCost: deriveDisplayUnitCost(
            roundDisplayMoney(Number(balance.totalValueKgs ?? 0) + delta),
            Number(balance.quantity),
          ),
          correctTotalCost: roundDisplayMoney(Number(balance.totalValueKgs ?? 0) + delta),
          difference: delta,
          reason: 'inventory_balance_total_stale_vs_active_branch_fifo_remaining',
          branchId: order.branchId,
          warehouseId: order.destinationWarehouseId,
          distributionOrderId: order.id,
          branchPurchaseRequestId: branchRequest?.id ?? null,
        });
      }
    }
  }

  const detectedMovementDifference = roundDisplayMoney(
    repairs
      .filter((row) => row.recordType === 'branch_stock_movement')
      .reduce((sum, row) => sum + Number(row.difference ?? 0), 0),
  );
  const movementDifferenceKgs =
    args.apply && distributionOrderIds.length > 0
      ? await computeMovementDriftKgsForOrders(prisma, distributionOrderIds)
      : detectedMovementDifference;

  const dryRunRows = repairs.map((row) => ({
    recordType: row.recordType,
    recordId: row.recordId,
    productId: row.productId,
    SKU: row.SKU,
    quantity: row.quantity,
    oldUnitCost: row.oldUnitCost,
    oldTotalCost: row.oldTotalCost,
    correctUnitCost: row.correctUnitCost,
    correctTotalCost: row.correctTotalCost,
    difference: row.difference,
    reason: row.reason,
  }));

  return {
    mode: args.apply ? 'APPLY' : 'DRY_RUN',
    filters: {
      branchRequestNumber: args.branchRequestNumber ?? null,
      distributionOrderId: args.distributionOrderId ?? null,
      distributionOrderNumber: args.distributionOrderNumber ?? null,
    },
    distributionOrderIds,
    repairSummary: {
      rows: repairs.length,
      movementDifferenceKgs,
      reconciliationLines: reconciliation.length,
      reconciliationDifferenceKgs: roundDisplayMoney(
        reconciliation.reduce((sum, row) => sum + row.difference, 0),
      ),
    },
    repairs: dryRunRows,
    productByProductReconciliation: reconciliation,
  };
}
