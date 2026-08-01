/**
 * Repair unauthorized HQ Warehouse cancellation of a branch distribution order.
 *
 * Usage (dry-run default):
 *   cd apps/api
 *   node --import tsx scripts/repair-distribution-order-cancellation.ts \
 *     --order-number=DO-BPR-1785498054695
 *
 * Apply:
 *   node --import tsx scripts/repair-distribution-order-cancellation.ts \
 *     --order-number=DO-BPR-1785498054695 \
 *     --apply
 */
import {
  AlertStatus,
  AlertType,
  BranchDistributionOrderStatus,
  BranchInvoiceStatus,
  HqStockBookingStatus,
  HqWarehousePickingTaskStatus,
  NotificationModule,
  PrismaClient,
  Role,
} from '@prisma/client';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import {
  buildRepairPlan,
  type RepairPlan,
} from '../src/distribution/repair-distribution-order-cancellation.util';

const POST_PAYMENT_BOOKING_HOURS = 72;
const REPAIRED_BY = 'repair-distribution-order-cancellation.ts';

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

type Args = { orderNumber?: string; orderId?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const orderNumberArg = argv.find((a) => a.startsWith('--order-number='));
  const orderIdArg = argv.find((a) => a.startsWith('--order-id='));
  return {
    orderNumber: orderNumberArg ? orderNumberArg.slice('--order-number='.length) : undefined,
    orderId: orderIdArg ? orderIdArg.slice('--order-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function printPlan(plan: RepairPlan, apply: boolean) {
  console.log('=== dry-run summary ===');
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        ...plan.dryRunSummary,
      },
      null,
      2,
    ),
  );
  console.log('--- investigation ---');
  console.log(JSON.stringify(plan.investigation, null, 2));
  console.log('--- safety ---');
  console.log(JSON.stringify(plan.safety, null, 2));
  console.log('--- planned ---');
  console.log(
    JSON.stringify(
      {
        alreadyRestored: plan.alreadyRestored,
        plannedDistributionStatus: plan.plannedDistributionStatus,
        plannedBprStatus: plan.plannedBprStatus,
        plannedPickingTaskStatus: plan.plannedPickingTaskStatus,
        needsPickingTask: plan.needsPickingTask,
        clearCancelledAt: plan.clearCancelledAt,
        extendBookings: plan.extendBookings,
        restoreInventoryReservations: plan.restoreInventoryReservations,
        restoreFifoReservations: plan.restoreFifoReservations,
        notifyWarehouse: plan.notifyWarehouse,
        plannedChanges: plan.plannedChanges,
      },
      null,
      2,
    ),
  );
}

async function loadPlan(prisma: PrismaClient, args: Args): Promise<RepairPlan | null> {
  if (!args.orderNumber && !args.orderId) {
    throw new Error('Provide --order-number or --order-id');
  }

  const order = await prisma.branchDistributionOrder.findFirst({
    where: {
      deletedAt: null,
      ...(args.orderId ? { id: args.orderId } : { orderNumber: args.orderNumber! }),
    },
    include: {
      items: true,
      pickingTask: true,
      stockBookings: true,
      branchInvoices: { include: { branchOrderInstallment: true } },
      goodsReceivings: { where: { deletedAt: null }, take: 1 },
      distributionFifoAllocations: {
        where: { status: 'RESERVED' },
        select: { id: true },
      },
    },
  });

  if (!order) return null;

  const bpr = await prisma.branchPurchaseRequest.findFirst({
    where: { convertedOrderId: order.id, deletedAt: null },
  });

  const audits = await prisma.auditLog.findMany({
    where: { entity: 'BranchDistributionOrder', entityId: order.id },
    orderBy: { timestamp: 'asc' },
  });

  const bprAudits = bpr
    ? await prisma.auditLog.findMany({
        where: { entity: 'BranchPurchaseRequest', entityId: bpr.id },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  const duplicateOrders = bpr
    ? await prisma.branchDistributionOrder.findMany({
        where: {
          deletedAt: null,
          id: { not: order.id },
          stockBookings: { some: { requestId: bpr.id } },
        },
        select: { id: true, status: true },
      })
    : [];

  const duplicateActiveOrders = duplicateOrders.filter(
    (row) => row.status !== BranchDistributionOrderStatus.CANCELLED,
  ).length;
  const duplicateShippedOrders = duplicateOrders.filter(
    (row) =>
      row.status === BranchDistributionOrderStatus.SHIPPED ||
      row.status === BranchDistributionOrderStatus.SENT,
  ).length;

  const stockMovements = await prisma.stockMovement.count({
    where: {
      referenceType: 'DISTRIBUTION_ORDER',
      referenceId: order.id,
      type: 'OUT',
      status: 'ACTIVE',
    },
  });

  const productInvoice =
    order.branchInvoices.find(
      (invoice) => !invoice.invoiceCategory || invoice.invoiceCategory === 'PRODUCT_ORDER',
    ) ?? null;
  const installment = productInvoice?.branchOrderInstallment ?? null;
  const missingFifoReservations =
    order.items.length > 0 && order.distributionFifoAllocations.length === 0;

  return buildRepairPlan({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      cancelledAt: order.cancelledAt,
      sentAt: order.sentAt,
      branchId: order.branchId,
      sourceWarehouseId: order.sourceWarehouseId,
    },
    bpr: bpr
      ? {
          id: bpr.id,
          requestNumber: bpr.requestNumber,
          status: bpr.status,
        }
      : null,
    installment: installment
      ? {
          id: installment.id,
          status: installment.status,
          approvedById: installment.approvedById,
          decidedAt: installment.decidedAt,
          firstPaymentAmount: installment.firstPaymentAmount,
        }
      : null,
    pickingTask: order.pickingTask
      ? {
          id: order.pickingTask.id,
          status: order.pickingTask.status,
          pickedAt: order.pickingTask.pickedAt,
          packedAt: order.pickingTask.packedAt,
          shippedAt: order.pickingTask.shippedAt,
        }
      : null,
    bookings: order.stockBookings.map((row) => ({
      id: row.id,
      status: row.status,
      bookedQuantity: row.bookedQuantity,
      confirmedQuantity: row.confirmedQuantity,
    })),
    audits,
    bprAudits,
    invoicePaid: productInvoice?.status === BranchInvoiceStatus.PAID,
    duplicateActiveOrders,
    duplicateShippedOrders,
    hasStockMovementsOut: stockMovements > 0,
    goodsReceivingId: order.goodsReceivings[0]?.id ?? null,
    missingFifoReservations,
  });
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function resolveRepairActorUserId(
  tx: Tx,
  preferredUserIds: Array<string | null | undefined>,
): Promise<string | null> {
  for (const id of preferredUserIds) {
    if (!id) continue;
    const found = await tx.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (found) return found.id;
  }
  const admin = await tx.user.findFirst({
    where: {
      deletedAt: null,
      role: { in: [Role.CEO, Role.OWNER, Role.SYSTEM_ADMINISTRATOR] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function withSavepoint<T>(tx: Tx, name: string, fn: () => Promise<T>): Promise<T> {
  const sp = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60) || 'repair_sp';
  await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
    throw err;
  }
}

async function resolveInventoryProduct(
  tx: Tx,
  warehouseId: string,
  productId: string,
  sku: string,
): Promise<{ productId: string; branchId: string } | null> {
  const product = await tx.product.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: productId }, { sku }],
    },
    select: { id: true, branchId: true, warehouseId: true, sku: true },
  });
  if (!product) return null;

  if (product.warehouseId === warehouseId) {
    return { productId: product.id, branchId: product.branchId };
  }

  const bySku = await tx.product.findFirst({
    where: {
      deletedAt: null,
      sku: product.sku,
      warehouseId,
    },
    select: { id: true, branchId: true },
  });
  if (bySku) return { productId: bySku.id, branchId: bySku.branchId };

  const hqCatalog = await tx.branch.findFirst({
    where: { code: 'EMOTORS-HQ', deletedAt: null },
    select: { id: true },
  });
  if (hqCatalog) {
    const catalogProduct = await tx.product.findFirst({
      where: {
        deletedAt: null,
        sku: product.sku,
        branchId: hqCatalog.id,
      },
      select: { id: true, branchId: true },
    });
    if (catalogProduct) {
      return { productId: catalogProduct.id, branchId: catalogProduct.branchId };
    }
  }

  return { productId: product.id, branchId: product.branchId };
}

async function restoreReservations(
  tx: Tx,
  prisma: PrismaClient,
  orderId: string,
  restoreInventory: boolean,
  restoreFifo: boolean,
  actorUserId: string | null,
) {
  const order = await tx.branchDistributionOrder.findFirstOrThrow({
    where: { id: orderId, deletedAt: null },
    include: {
      items: true,
      sourceWarehouse: { select: { id: true, branchId: true } },
      branch: { select: { branchType: true, hqToBranchMarkupPercent: true } },
    },
  });

  if (restoreInventory) {
    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const inventoryProduct = await resolveInventoryProduct(
        tx,
        order.sourceWarehouseId,
        item.productId,
        item.sku,
      );
      if (!inventoryProduct) continue;

      const updated = await tx.inventoryBalance.updateMany({
        where: {
          branchId: inventoryProduct.branchId,
          warehouseId: order.sourceWarehouseId,
          productId: inventoryProduct.productId,
        },
        data: { reservedQuantity: { increment: item.quantity } },
      });
      if (updated.count === 0) {
        console.warn(
          `Inventory reservedQuantity re-increment skipped for ${item.sku}: balance row not found`,
        );
      }
    }
  }

  if (!restoreFifo) return;

  const fifo = new PricingFifoService(prisma as never);
  let fifoRestored = 0;
  let fifoSkipped = 0;

  for (const [index, item] of order.items.entries()) {
    if (item.quantity <= 0) continue;
    const inventoryProduct = await resolveInventoryProduct(
      tx,
      order.sourceWarehouseId,
      item.productId,
      item.sku,
    );
    if (!inventoryProduct) {
      fifoSkipped += 1;
      continue;
    }

    const product = await tx.product.findFirst({
      where: { id: inventoryProduct.productId, deletedAt: null },
      select: { id: true, hqBranchWholesaleMarkupPercent: true },
    });
    if (!product) {
      fifoSkipped += 1;
      continue;
    }

    const productMarkup = Number(product.hqBranchWholesaleMarkupPercent ?? 0);
    const branchMarkup = Number(order.branch?.hqToBranchMarkupPercent ?? 0);
    const markupPercent = productMarkup > 0 ? productMarkup : branchMarkup;
    const isHqOwnedBranch = fifo.isHqBranchType(order.branch.branchType);

    try {
      await withSavepoint(tx, `fifo_restore_${index}`, async () => {
        await fifo.reserveFifoForDistribution(tx, {
          productId: product.id,
          warehouseId: order.sourceWarehouseId,
          quantity: item.quantity,
          isHqOwnedBranch,
          branchPricing: {
            branchType: order.branch.branchType,
            hqToBranchMarkupPercent: markupPercent,
          },
          distributionOrderId: order.id,
          distributionOrderItemId: item.id,
          // AuditLog.userId is nullable — never pass a fake non-FK user id.
          userId: actorUserId,
          userRole: Role.SYSTEM_ADMINISTRATOR,
        });
      });
      fifoRestored += 1;
    } catch (err) {
      fifoSkipped += 1;
      console.warn(
        `FIFO re-reserve skipped for item ${item.sku}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `FIFO reservation restore complete: restored=${fifoRestored}, skipped=${fifoSkipped}`,
  );
}

async function applyRepair(prisma: PrismaClient, plan: RepairPlan) {
  if (!plan.safety.safe || plan.alreadyRestored || !plan.plannedDistributionStatus) {
    throw new Error('Repair plan is not safe or already applied');
  }

  const order = await prisma.branchDistributionOrder.findFirstOrThrow({
    where: { id: plan.investigation.distributionOrderId, deletedAt: null },
    include: { pickingTask: true, branch: { select: { name: true } } },
  });

  if (order.status !== BranchDistributionOrderStatus.CANCELLED) {
    console.log('Order already restored — idempotent skip');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const actorUserId = await resolveRepairActorUserId(tx, [
        plan.investigation.installmentApprovedBy,
        plan.investigation.cancelledByUserId,
      ]);

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          status: plan.plannedDistributionStatus!,
          cancelledAt: plan.clearCancelledAt ? null : order.cancelledAt,
        },
      });

      if (plan.plannedBprStatus && plan.investigation.branchOrderId) {
        await tx.branchPurchaseRequest.update({
          where: { id: plan.investigation.branchOrderId },
          data: { status: plan.plannedBprStatus },
        });
      }

      if (plan.extendBookings && plan.investigation.branchOrderId) {
        const expiresAt = addHours(new Date(), POST_PAYMENT_BOOKING_HOURS);
        await tx.hqStockBooking.updateMany({
          where: {
            requestId: plan.investigation.branchOrderId,
            status: { in: [HqStockBookingStatus.ACTIVE, HqStockBookingStatus.CONFIRMED] },
          },
          data: { expiresAt, distributionOrderId: order.id },
        });
        await tx.branchPurchaseRequest.update({
          where: { id: plan.investigation.branchOrderId },
          data: { bookingExpiresAt: expiresAt },
        });
      }

      if (plan.restoreInventoryReservations || plan.restoreFifoReservations) {
        await restoreReservations(
          tx,
          prisma,
          order.id,
          plan.restoreInventoryReservations,
          plan.restoreFifoReservations,
          actorUserId,
        );
      }

      if (plan.needsPickingTask) {
        const existing = await tx.hqWarehousePickingTask.findUnique({
          where: { distributionOrderId: order.id },
        });
        if (!existing) {
          const managerAssignment = await tx.hqWarehouseManagerAssignment.findFirst({
            where: { warehouseId: order.sourceWarehouseId, status: 'ACTIVE' },
            orderBy: { assignedAt: 'asc' },
          });
          await tx.hqWarehousePickingTask.create({
            data: {
              distributionOrderId: order.id,
              sourceHqWarehouseId: order.sourceWarehouseId,
              assignedWarehouseManagerId: managerAssignment?.userId,
              status: plan.plannedPickingTaskStatus ?? HqWarehousePickingTaskStatus.ASSIGNED,
            },
          });
        }
      } else if (order.pickingTask && plan.plannedPickingTaskStatus) {
        await tx.hqWarehousePickingTask.update({
          where: { id: order.pickingTask.id },
          data: { status: plan.plannedPickingTaskStatus },
        });
      }

      const existingReversal = await tx.auditLog.findFirst({
        where: {
          entity: 'BranchDistributionOrder',
          entityId: order.id,
          action: 'UNAUTHORIZED_HQ_WAREHOUSE_CANCELLATION_REVERSED',
        },
      });

      if (!existingReversal) {
        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: 'UNAUTHORIZED_HQ_WAREHOUSE_CANCELLATION_REVERSED',
            entity: 'BranchDistributionOrder',
            entityId: order.id,
            role: Role.SYSTEM_ADMINISTRATOR,
            metadata: {
              distributionOrderId: order.id,
              distributionOrderNumber: order.orderNumber,
              oldStatus: BranchDistributionOrderStatus.CANCELLED,
              restoredStatus: plan.plannedDistributionStatus,
              originalCancelledBy: plan.investigation.cancelledByUserId,
              originalCancelledAt: plan.investigation.cancelledAt,
              originalCancellationReason: plan.investigation.cancellationReason,
              originalCancelledByRole: plan.investigation.cancelledByRole,
              repairReason:
                'Accidental unauthorized HQ Warehouse cancellation reversed by repair script',
              repairedBy: REPAIRED_BY,
              repairedAt: new Date().toISOString(),
            },
          },
        });
      }

      if (plan.notifyWarehouse) {
        const recentAlert = await tx.alert.findFirst({
          where: {
            entityId: order.id,
            type: AlertType.BRANCH_ORDER_READY_FOR_WAREHOUSE,
            status: AlertStatus.UNREAD,
            createdAt: { gte: addHours(new Date(), -24) },
          },
        });
        if (!recentAlert) {
          await tx.alert.create({
            data: {
              branchId: null,
              type: AlertType.BRANCH_ORDER_READY_FOR_WAREHOUSE,
              module: NotificationModule.WAREHOUSE,
              recipientRole: Role.WAREHOUSE_MANAGER,
              title: 'Заказ готов к комплектации на складе HQ',
              message: `Заказ ${order.orderNumber} восстановлен и готов к комплектации. Филиал: ${order.branch?.name ?? order.branchId}.`,
              entityType: 'BranchDistributionOrder',
              entityId: order.id,
              referenceNumber: order.orderNumber,
              status: AlertStatus.UNREAD,
            },
          });
        }
      }
    },
    { timeout: 120_000 },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const plan = await loadPlan(prisma, args);
    if (!plan) {
      console.error('Distribution order not found');
      process.exit(1);
    }

    printPlan(plan, args.apply);

    if (!args.apply) {
      console.log('Dry-run only. Re-run with --apply to execute repair.');
      return;
    }

    if (plan.alreadyRestored) {
      console.log('Order is not cancelled — no repair needed (idempotent).');
      return;
    }

    if (!plan.safety.safe) {
      console.error('Repair blocked:', plan.safety.blockingRisks.join(', '));
      process.exit(1);
    }

    await applyRepair(prisma, plan);
    console.log('Repair applied successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
