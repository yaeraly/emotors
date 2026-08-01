/**
 * Integration: seed cancelled DO-BPR-1785498054695-shaped order and verify repair.
 * Skips when DATABASE_URL is unset.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchDistributionOrderStatus,
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
  PrismaClient,
  Role,
} from '@prisma/client';
import { buildRepairPlan } from './repair-distribution-order-cancellation.util';

const ORDER_NUMBER = 'DO-BPR-1785498054695';
const hasDb = Boolean(process.env.DATABASE_URL);

describe('repair-distribution-order-cancellation integration', { skip: !hasDb }, () => {
  it('loads, dry-runs, applies, and is idempotent for DO-BPR-1785498054695 fixture', async () => {
    const prisma = new PrismaClient();
    try {
      const branch = await prisma.branch.findFirst({
        where: { code: 'BISHKEK', deletedAt: null },
      });
      const hqWarehouse = await prisma.warehouse.findFirst({
        where: { warehouseType: 'HQ', isActive: true },
      });
      const branchWarehouse = await prisma.warehouse.findFirst({
        where: { branchId: branch?.id ?? undefined, warehouseType: 'BRANCH' },
      });
      const ceo = await prisma.user.findFirst({ where: { role: Role.CEO, deletedAt: null } });
      const warehouseManager = await prisma.user.findFirst({
        where: { role: Role.WAREHOUSE_MANAGER, deletedAt: null },
      });
      const hqCatalog = await prisma.branch.findFirst({
        where: { code: 'EMOTORS-HQ', deletedAt: null },
      });
      const category = await prisma.productCategory.findFirst({ where: { isActive: true } });

      assert.ok(
        branch && hqWarehouse && ceo && warehouseManager && hqCatalog && category,
        'seed prerequisites',
      );

      const existing = await prisma.branchDistributionOrder.findFirst({
        where: { orderNumber: ORDER_NUMBER },
      });
      if (existing) {
        await prisma.alert.deleteMany({ where: { entityId: existing.id } });
        await prisma.auditLog.deleteMany({
          where: { entity: 'BranchDistributionOrder', entityId: existing.id },
        });
        await prisma.hqWarehousePickingTask.deleteMany({
          where: { distributionOrderId: existing.id },
        });
        await prisma.branchOrderInstallment.deleteMany({
          where: { invoice: { distributionOrderId: existing.id } },
        });
        await prisma.branchInvoice.deleteMany({ where: { distributionOrderId: existing.id } });
        await prisma.hqStockBooking.deleteMany({ where: { distributionOrderId: existing.id } });
        await prisma.branchDistributionOrderItem.deleteMany({ where: { orderId: existing.id } });
        const bpr = await prisma.branchPurchaseRequest.findFirst({
          where: { convertedOrderId: existing.id },
        });
        if (bpr) {
          await prisma.hqStockBooking.deleteMany({ where: { requestId: bpr.id } });
          await prisma.branchPurchaseRequestItem.deleteMany({ where: { requestId: bpr.id } });
          await prisma.branchPurchaseRequest.delete({ where: { id: bpr.id } });
        }
        await prisma.branchDistributionOrder.delete({ where: { id: existing.id } });
      }

      let product = await prisma.product.findFirst({
        where: { branchId: hqCatalog.id, deletedAt: null, isActive: true },
      });
      if (!product) {
        product = await prisma.product.create({
          data: {
            branchId: hqCatalog.id,
            warehouseId: hqWarehouse.id,
            categoryId: category.id,
            sku: 'REPAIR-TEST-SKU-001',
            name: 'Repair Test Product',
            category: category.code ?? 'TEST',
            unit: 'pcs',
            isActive: true,
          },
        });
      }

      const destWarehouseId =
        branchWarehouse?.id ??
        (
          await prisma.warehouse.create({
            data: {
              branchId: branch.id,
              warehouseType: 'BRANCH',
              name: 'Bishkek Branch WH (repair fixture)',
              code: `BISHKEK-REPAIR-${Date.now()}`,
            },
          })
        ).id;

      const order = await prisma.branchDistributionOrder.create({
        data: {
          orderNumber: ORDER_NUMBER,
          branchId: branch.id,
          sourceWarehouseId: hqWarehouse.id,
          destinationWarehouseId: destWarehouseId,
          status: BranchDistributionOrderStatus.CANCELLED,
          cancelledAt: new Date('2026-08-01T10:00:00Z'),
          totalAmount: 5000,
          totalCost: 3000,
          totalProfit: 2000,
          createdById: ceo.id,
          items: {
            create: [
              {
                productId: product.id,
                sku: product.sku,
                productName: product.name,
                quantity: 5,
                unitCost: 600,
                unitPrice: 1000,
                totalCost: 3000,
                totalPrice: 5000,
                profit: 2000,
              },
            ],
          },
        },
        include: { items: true },
      });

      const bpr = await prisma.branchPurchaseRequest.create({
        data: {
          requestNumber: 'BPR-1785498054695',
          branchId: branch.id,
          branchWarehouseId: destWarehouseId,
          assignedHqWarehouseId: hqWarehouse.id,
          status: BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
          createdById: ceo.id,
          convertedOrderId: order.id,
          totalQuantity: 5,
          totalEstimatedAmount: 5000,
          items: {
            create: [
              {
                productId: product.id,
                sku: product.sku,
                productName: product.name,
                quantity: 10,
                approvedQuantity: 5,
                bookedQuantity: 5,
                lineStatus: 'APPROVED',
              },
            ],
          },
        },
        include: { items: true },
      });

      const invoice = await prisma.branchInvoice.create({
        data: {
          invoiceNumber: `INV-REPAIR-${Date.now()}`,
          branchId: branch.id,
          distributionOrderId: order.id,
          status: 'ISSUED',
          totalAmount: 5000,
          paidAmount: 0,
          debtAmount: 5000,
          dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          createdById: ceo.id,
        },
      });

      const installment = await prisma.branchOrderInstallment.create({
        data: {
          branchId: branch.id,
          invoiceId: invoice.id,
          branchPurchaseRequestId: bpr.id,
          status: BranchOrderInstallmentStatus.APPROVED,
          totalAmount: 5000,
          termMonths: 3,
          firstPaymentAmount: 0,
          firstPaymentRequired: false,
          requestedById: ceo.id,
          approvedById: ceo.id,
          decidedAt: new Date('2026-08-01T09:00:00Z'),
        },
      });

      const booking = await prisma.hqStockBooking.create({
        data: {
          requestId: bpr.id,
          requestLineId: bpr.items[0]!.id,
          productId: product.id,
          branchId: branch.id,
          warehouseId: hqWarehouse.id,
          bookedQuantity: 5,
          confirmedQuantity: 5,
          status: 'CONFIRMED',
          distributionOrderId: order.id,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          createdById: ceo.id,
          confirmedAt: new Date(),
          confirmedById: ceo.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: warehouseManager.id,
          role: Role.WAREHOUSE_MANAGER,
          action: 'DISTRIBUTION_ORDER_CANCELLED',
          entity: 'BranchDistributionOrder',
          entityId: order.id,
          metadata: {
            reason: 'Unauthorized warehouse cancel (fixture)',
            previousStatus: BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
          },
        },
      });

      const plan = buildRepairPlan({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          cancelledAt: order.cancelledAt,
          sentAt: order.sentAt,
          branchId: order.branchId,
          sourceWarehouseId: order.sourceWarehouseId,
        },
        bpr: {
          id: bpr.id,
          requestNumber: bpr.requestNumber,
          status: bpr.status,
        },
        installment: {
          id: installment.id,
          status: installment.status,
          approvedById: installment.approvedById,
          decidedAt: installment.decidedAt,
          firstPaymentAmount: installment.firstPaymentAmount,
        },
        pickingTask: null,
        bookings: [
          {
            id: booking.id,
            status: booking.status,
            bookedQuantity: booking.bookedQuantity,
            confirmedQuantity: booking.confirmedQuantity,
          },
        ],
        audits: [
          {
            action: 'DISTRIBUTION_ORDER_CANCELLED',
            userId: warehouseManager.id,
            role: Role.WAREHOUSE_MANAGER,
            timestamp: new Date('2026-08-01T10:00:00Z'),
            metadata: { reason: 'Unauthorized warehouse cancel (fixture)' },
          },
        ],
        bprAudits: [],
        invoicePaid: false,
        duplicateActiveOrders: 0,
        duplicateShippedOrders: 0,
        hasStockMovementsOut: false,
        goodsReceivingId: null,
        missingFifoReservations: true,
      });

      assert.equal(plan.safety.safe, true);
      assert.equal(plan.plannedDistributionStatus, BranchDistributionOrderStatus.SENT_TO_WAREHOUSE);
      assert.equal(plan.investigation.cancelledByUserId, warehouseManager.id);
      assert.equal(plan.investigation.cancelledByRole, Role.WAREHOUSE_MANAGER);
      assert.equal(plan.investigation.installmentStatus, BranchOrderInstallmentStatus.APPROVED);

      await prisma.$transaction(async (tx) => {
        await tx.branchDistributionOrder.update({
          where: { id: order.id },
          data: {
            status: plan.plannedDistributionStatus!,
            cancelledAt: null,
          },
        });
        await tx.branchPurchaseRequest.update({
          where: { id: bpr.id },
          data: { status: plan.plannedBprStatus! },
        });
        const existingTask = await tx.hqWarehousePickingTask.findUnique({
          where: { distributionOrderId: order.id },
        });
        if (!existingTask) {
          await tx.hqWarehousePickingTask.create({
            data: {
              distributionOrderId: order.id,
              sourceHqWarehouseId: order.sourceWarehouseId,
              assignedWarehouseManagerId: warehouseManager.id,
              status: 'ASSIGNED',
            },
          });
        }
        await tx.auditLog.create({
          data: {
            action: 'UNAUTHORIZED_HQ_WAREHOUSE_CANCELLATION_REVERSED',
            entity: 'BranchDistributionOrder',
            entityId: order.id,
            role: Role.SYSTEM_ADMINISTRATOR,
            metadata: {
              distributionOrderId: order.id,
              distributionOrderNumber: order.orderNumber,
              oldStatus: BranchDistributionOrderStatus.CANCELLED,
              restoredStatus: plan.plannedDistributionStatus,
              originalCancelledBy: warehouseManager.id,
              repairedBy: 'integration-test',
              repairedAt: new Date().toISOString(),
            },
          },
        });
      });

      const restored = await prisma.branchDistributionOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          pickingTask: true,
          branchInvoices: { include: { branchOrderInstallment: true } },
        },
      });
      assert.equal(restored.orderNumber, ORDER_NUMBER);
      assert.equal(restored.id, order.id);
      assert.equal(restored.status, BranchDistributionOrderStatus.SENT_TO_WAREHOUSE);
      assert.equal(restored.cancelledAt, null);
      assert.equal(Number(restored.totalAmount), 5000);
      assert.equal(restored.items[0]?.quantity, 5);
      assert.ok(restored.pickingTask);
      assert.equal(
        restored.branchInvoices[0]?.branchOrderInstallment?.status,
        BranchOrderInstallmentStatus.APPROVED,
      );

      const taskCount = await prisma.hqWarehousePickingTask.count({
        where: { distributionOrderId: order.id },
      });
      assert.equal(taskCount, 1);

      // Second apply plan is idempotent (no new order / no further planned mutation).
      const idempotent = buildRepairPlan({
        order: {
          id: restored.id,
          orderNumber: restored.orderNumber,
          status: restored.status,
          cancelledAt: restored.cancelledAt,
          sentAt: restored.sentAt,
          branchId: restored.branchId,
          sourceWarehouseId: restored.sourceWarehouseId,
        },
        bpr: {
          id: bpr.id,
          requestNumber: bpr.requestNumber,
          status: BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
        },
        installment: {
          id: installment.id,
          status: BranchOrderInstallmentStatus.APPROVED,
          approvedById: ceo.id,
          decidedAt: installment.decidedAt,
          firstPaymentAmount: 0,
        },
        pickingTask: restored.pickingTask
          ? {
              id: restored.pickingTask.id,
              status: restored.pickingTask.status,
              pickedAt: restored.pickingTask.pickedAt,
              packedAt: restored.pickingTask.packedAt,
              shippedAt: restored.pickingTask.shippedAt,
            }
          : null,
        bookings: [{ id: booking.id, status: 'CONFIRMED', bookedQuantity: 5, confirmedQuantity: 5 }],
        audits: [],
        bprAudits: [],
        invoicePaid: false,
        duplicateActiveOrders: 0,
        duplicateShippedOrders: 0,
        hasStockMovementsOut: false,
        goodsReceivingId: null,
      });
      assert.equal(idempotent.alreadyRestored, true);
      assert.equal(idempotent.plannedDistributionStatus, null);

      // Run real script dry-run against restored order.
      const { spawnSync } = await import('node:child_process');
      const dry = spawnSync(
        'node',
        [
          '--import',
          'tsx',
          'scripts/repair-distribution-order-cancellation.ts',
          `--order-number=${ORDER_NUMBER}`,
        ],
        {
          cwd: new URL('../../', import.meta.url).pathname,
          env: process.env,
          encoding: 'utf8',
        },
      );
      assert.equal(dry.status, 0, dry.stderr || dry.stdout);
      assert.match(dry.stdout, /alreadyRestored": true|Order is not cancelled|dry-run summary/);
    } finally {
      await prisma.$disconnect();
    }
  });
});
