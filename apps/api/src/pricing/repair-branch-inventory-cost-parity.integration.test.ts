/**
 * Integration: seed DO-BPR-1785498054695-shaped cost drift fixture and verify repair.
 * Skips when DATABASE_URL is unset.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchDistributionOrderStatus,
  PrismaClient,
  Role,
  StockMovementStatus,
  StockMovementType,
} from '@prisma/client';
import { sumWarehouseFifoRemainingValueKgs } from '../inventory/inventory-authoritative-value.util';
import {
  parseRepairBranchInventoryCostParityArgs,
  runBranchInventoryCostParityRepair,
} from './repair-branch-inventory-cost-parity.util';
import { deriveDisplayUnitCost, roundDisplayMoney } from './product-cost-precision.util';

const ORDER_NUMBER = 'DO-BPR-1785498054695';
const ALLOCATION_COUNT = 54;
const LINE_QTY = 10;
const LINE_TOTAL_AUTHORITATIVE = 100.01;
const LINE_TOTAL_STALE = 100.0;
const AUTHORITATIVE_TOTAL = 5400.54;
const STALE_TOTAL = 5400.0;
const DRIFT = 0.54;

const hasDb = Boolean(process.env.DATABASE_URL);

describe('repair-branch-inventory-cost-parity integration', { skip: !hasDb }, () => {
  it('dry-runs, applies, and is idempotent for DO-BPR-1785498054695 fixture', async () => {
    const prisma = new PrismaClient();
    const seeded = {
      orderId: '',
      productId: '',
      allocationIds: [] as string[],
      branchMovementIds: [] as string[],
      branchFifoIds: [] as string[],
      hqFifoIds: [] as string[],
      hqMovementIds: [] as string[],
      balanceId: '',
    };

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
      const hqCatalog = await prisma.branch.findFirst({
        where: { code: 'EMOTORS-HQ', deletedAt: null },
      });
      const category = await prisma.productCategory.findFirst({ where: { isActive: true } });

      assert.ok(branch && hqWarehouse && ceo && hqCatalog && category, 'seed prerequisites');

      const destWarehouseId =
        branchWarehouse?.id ??
        (
          await prisma.warehouse.create({
            data: {
              branchId: branch.id,
              warehouseType: 'BRANCH',
              name: 'Bishkek Branch WH (cost parity fixture)',
              code: `BISHKEK-COST-PARITY-${Date.now()}`,
            },
          })
        ).id;

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
        await prisma.distributionFifoAllocation.deleteMany({
          where: { distributionOrderId: existing.id },
        });
        const existingMovements = await prisma.stockMovement.findMany({
          where: {
            referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
            warehouseId: destWarehouseId,
          },
          select: { id: true },
        });
        const movementIds = existingMovements.map((row) => row.id);
        if (movementIds.length) {
          await prisma.fifoInventoryBatch.deleteMany({
            where: { stockMovementId: { in: movementIds } },
          });
          await prisma.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
        }
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
            sku: 'COST-PARITY-TEST-SKU',
            name: 'Cost Parity Test Product',
            category: category.code ?? 'TEST',
            unit: 'pcs',
            isActive: true,
          },
        });
      }
      seeded.productId = product.id;

      const lineUnitCost = deriveDisplayUnitCost(LINE_TOTAL_AUTHORITATIVE, LINE_QTY);
      assert.equal(lineUnitCost, 10);

      const order = await prisma.branchDistributionOrder.create({
        data: {
          orderNumber: ORDER_NUMBER,
          branchId: branch.id,
          sourceWarehouseId: hqWarehouse.id,
          destinationWarehouseId: destWarehouseId,
          status: BranchDistributionOrderStatus.RECEIVED_AT_BRANCH,
          totalAmount: 8000,
          totalCost: STALE_TOTAL,
          totalProfit: 2000,
          createdById: ceo.id,
          items: {
            create: [
              {
                productId: product.id,
                sku: product.sku,
                productName: product.name,
                quantity: ALLOCATION_COUNT * LINE_QTY,
                unitCost: lineUnitCost,
                unitPrice: 15,
                totalCost: STALE_TOTAL,
                totalPrice: 8000,
                profit: 2000,
                transportCostPerUnit: 0,
                transportExpenseAllocation: 0,
              },
            ],
          },
        },
        include: { items: true },
      });
      seeded.orderId = order.id;
      const orderItem = order.items[0]!;

      for (let index = 0; index < ALLOCATION_COUNT; index++) {
        const hqMovement = await prisma.stockMovement.create({
          data: {
            branchId: hqCatalog.id,
            warehouseId: hqWarehouse.id,
            productId: product.id,
            type: StockMovementType.IN,
            quantity: LINE_QTY,
            unitCostKgs: lineUnitCost,
            totalCostKgs: LINE_TOTAL_AUTHORITATIVE,
            referenceType: 'COST_PARITY_FIXTURE',
            referenceId: `${order.id}-${index}`,
            createdById: ceo.id,
          },
        });
        seeded.hqMovementIds.push(hqMovement.id);

        const hqFifo = await prisma.fifoInventoryBatch.create({
          data: {
            productId: product.id,
            warehouseId: hqWarehouse.id,
            stockMovementId: hqMovement.id,
            unitCostKgs: lineUnitCost,
            initialQuantity: LINE_QTY,
            remainingQuantity: 0,
            reservedQuantity: 0,
            referenceType: 'COST_PARITY_FIXTURE',
            referenceId: `${order.id}-hq-${index}`,
          },
        });
        seeded.hqFifoIds.push(hqFifo.id);

        const allocation = await prisma.distributionFifoAllocation.create({
          data: {
            distributionOrderId: order.id,
            distributionOrderItemId: orderItem.id,
            fifoBatchId: hqFifo.id,
            productId: product.id,
            quantity: LINE_QTY,
            unitCostKgs: lineUnitCost,
            unitPriceKgs: 15,
            wholesalePriceKgs: 12,
            hqBranchWholesalePriceKgs: 12,
            totalCostKgs: LINE_TOTAL_AUTHORITATIVE,
            totalPriceKgs: roundDisplayMoney(15 * LINE_QTY),
            markupPercent: 0,
            profitKgs: roundDisplayMoney(15 * LINE_QTY - LINE_TOTAL_AUTHORITATIVE),
            status: 'CONSUMED',
          },
        });
        seeded.allocationIds.push(allocation.id);

        const branchMovement = await prisma.stockMovement.create({
          data: {
            branchId: branch.id,
            warehouseId: destWarehouseId,
            productId: product.id,
            type: StockMovementType.IN,
            quantity: LINE_QTY,
            unitCostKgs: lineUnitCost,
            totalCostKgs: LINE_TOTAL_STALE,
            status: StockMovementStatus.ACTIVE,
            referenceType: 'DISTRIBUTION_FIFO_ALLOCATION',
            referenceId: allocation.id,
            createdById: ceo.id,
          },
        });
        seeded.branchMovementIds.push(branchMovement.id);

        const branchFifo = await prisma.fifoInventoryBatch.create({
          data: {
            productId: product.id,
            warehouseId: destWarehouseId,
            stockMovementId: branchMovement.id,
            unitCostKgs: lineUnitCost,
            initialQuantity: LINE_QTY,
            remainingQuantity: LINE_QTY,
            reservedQuantity: 0,
            referenceType: 'HQ_FIFO_LAYER',
            referenceId: hqFifo.id,
          },
        });
        seeded.branchFifoIds.push(branchFifo.id);
      }

      const balance = await prisma.inventoryBalance.create({
        data: {
          branchId: branch.id,
          warehouseId: destWarehouseId,
          productId: product.id,
          quantity: ALLOCATION_COUNT * LINE_QTY,
          averageCostKgs: deriveDisplayUnitCost(STALE_TOTAL, ALLOCATION_COUNT * LINE_QTY),
          totalValueKgs: STALE_TOTAL,
        },
      });
      seeded.balanceId = balance.id;

      const dryRun = await runBranchInventoryCostParityRepair(prisma, {
        distributionOrderNumber: ORDER_NUMBER,
        apply: false,
      });
      assert.equal(dryRun.mode, 'DRY_RUN');
      assert.equal(dryRun.repairSummary.movementDifferenceKgs, DRIFT);
      assert.equal(
        dryRun.repairs.filter((row) => row.recordType === 'branch_stock_movement').length,
        ALLOCATION_COUNT,
      );

      const applied = await runBranchInventoryCostParityRepair(prisma, {
        distributionOrderNumber: ORDER_NUMBER,
        apply: true,
      });
      assert.equal(applied.mode, 'APPLY');
      assert.equal(applied.repairSummary.movementDifferenceKgs, 0);

      const fifoRemaining = await sumWarehouseFifoRemainingValueKgs(prisma, destWarehouseId);
      assert.equal(fifoRemaining, AUTHORITATIVE_TOTAL);

      const balanceAfter = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { id: balance.id },
      });
      assert.equal(roundDisplayMoney(balanceAfter.totalValueKgs ?? 0), AUTHORITATIVE_TOTAL);

      const secondApply = await runBranchInventoryCostParityRepair(prisma, {
        distributionOrderNumber: ORDER_NUMBER,
        apply: true,
      });
      assert.equal(
        secondApply.repairs.filter((row) => row.recordType === 'branch_stock_movement').length,
        0,
      );
      assert.equal(secondApply.repairSummary.movementDifferenceKgs, 0);

      const parsed = parseRepairBranchInventoryCostParityArgs([
        `--distribution-order-number=${ORDER_NUMBER}`,
      ]);
      assert.equal(parsed.distributionOrderNumber, ORDER_NUMBER);
      assert.equal(parsed.apply, false);
    } finally {
      if (seeded.orderId) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { entityId: { in: seeded.branchMovementIds } },
              { entityId: { in: seeded.branchFifoIds } },
              { entityId: seeded.balanceId },
            ],
          },
        });
        await prisma.distributionFifoAllocation.deleteMany({
          where: { id: { in: seeded.allocationIds } },
        });
        await prisma.fifoInventoryBatch.deleteMany({
          where: { id: { in: [...seeded.branchFifoIds, ...seeded.hqFifoIds] } },
        });
        await prisma.stockMovement.deleteMany({
          where: { id: { in: [...seeded.branchMovementIds, ...seeded.hqMovementIds] } },
        });
        if (seeded.balanceId) {
          await prisma.inventoryBalance.delete({ where: { id: seeded.balanceId } });
        }
        await prisma.branchDistributionOrderItem.deleteMany({ where: { orderId: seeded.orderId } });
        await prisma.branchDistributionOrder.delete({ where: { id: seeded.orderId } });
      }
      await prisma.$disconnect();
    }
  });
});
