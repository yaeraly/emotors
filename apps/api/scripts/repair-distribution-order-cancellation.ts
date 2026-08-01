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
function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
import {
  buildRepairPlan,
  type RepairPlan,
} from '../src/distribution/repair-distribution-order-cancellation.util';

const POST_PAYMENT_BOOKING_HOURS = 72;

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
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...plan.investigation }, null, 2));
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
      pickingTask: true,
      stockBookings: true,
      branchInvoices: { include: { branchOrderInstallment: true } },
      goodsReceivings: { where: { deletedAt: null }, take: 1 },
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
      deletedAt: null,
    },
  });

  const productInvoice =
    order.branchInvoices.find(
      (invoice) => !invoice.invoiceCategory || invoice.invoiceCategory === 'PRODUCT_ORDER',
    ) ?? null;
  const installment = productInvoice?.branchOrderInstallment ?? null;

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
  });
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

  await prisma.$transaction(async (tx) => {
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
          action: 'UNAUTHORIZED_HQ_WAREHOUSE_CANCELLATION_REVERSED',
          entity: 'BranchDistributionOrder',
          entityId: order.id,
          metadata: {
            distributionOrderId: order.id,
            distributionOrderNumber: order.orderNumber,
            oldStatus: BranchDistributionOrderStatus.CANCELLED,
            restoredStatus: plan.plannedDistributionStatus,
            originalCancelledBy: plan.investigation.cancelledByUserId,
            originalCancelledAt: plan.investigation.cancelledAt,
            originalCancellationReason: plan.investigation.cancellationReason,
            originalCancelledByRole: plan.investigation.cancelledByRole,
            repairReason: 'Unauthorized HQ Warehouse cancellation reversed by repair script',
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
  });
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

    if (!plan.safety.safe) {
      console.error('Repair blocked:', plan.safety.blockingRisks.join(', '));
      process.exit(1);
    }

    if (plan.alreadyRestored) {
      console.log('Order is not cancelled — no repair needed (idempotent).');
      return;
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
