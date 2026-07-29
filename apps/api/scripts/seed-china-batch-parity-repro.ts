/**
 * Seeds the representative 62-line China batch (914369.80 KGS) with legacy unit×qty drift
 * simulating production inventory balance discrepancy (−0.78 KGS).
 *
 * Usage: cd apps/api && node --import tsx scripts/seed-china-batch-parity-repro.ts
 */
import {
  BranchType,
  PrismaClient,
  ProcurementLandedCostStatus,
  ProcurementOrderItemStatus,
  ProcurementOrderStatus,
  StockMovementType,
  WarehouseType,
} from '@prisma/client';
import { distributeRoundedAmounts } from '../src/procurement/landed-cost-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';

const REPRO_ORDER_NUMBER = 'CHINA-BATCH-PARITY-REPRO';
const CHINA_BATCH_PRODUCT_COST_TOTAL = 914369.8;
const LINE_QUANTITY = 11;

function buildLineTotals() {
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, CHINA_BATCH_PRODUCT_COST_TOTAL);
}

async function main() {
  const prisma = new PrismaClient();
  const lineTotals = buildLineTotals();
  const authoritativeTotal = sumDisplayMoneyTotals(lineTotals);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.procurementOrder.findFirst({
      where: { orderNumber: REPRO_ORDER_NUMBER, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      const productIds = (
        await tx.procurementOrderItem.findMany({
          where: { orderId: existing.id },
          select: { productId: true },
        })
      ).map((row) => row.productId);

      await tx.distributionFifoAllocation.deleteMany({ where: { productId: { in: productIds } } });
      await tx.saleFifoAllocation.deleteMany({ where: { productId: { in: productIds } } });
      await tx.fifoInventoryBatch.deleteMany({ where: { productId: { in: productIds } } });
      await tx.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
      await tx.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
      await tx.procurementGoodsReceivingItem.deleteMany({
        where: { receiving: { procurementOrderId: existing.id } },
      });
      await tx.procurementGoodsReceiving.deleteMany({ where: { procurementOrderId: existing.id } });
      await tx.procurementOrderItem.deleteMany({ where: { orderId: existing.id } });
      await tx.procurementOrder.delete({ where: { id: existing.id } });
      await tx.product.deleteMany({
        where: { sku: { startsWith: 'CHINA-PARITY-' } },
      });
    }

    const hqBranch = await tx.branch.findFirst({ where: { code: 'EMOTORS-HQ' } });
    const wh = await tx.warehouse.findFirst({
      where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    });
    const user = await tx.user.findFirst({ where: { deletedAt: null } });
    if (!hqBranch || !wh || !user) {
      throw new Error('HQ branch, warehouse, and user required');
    }

    let cat = await tx.productCategory.findFirst({ where: { isActive: true } });
    if (!cat) {
      cat = await tx.productCategory.create({
        data: {
          code: 'PAR',
          nameKy: 'Parity',
          nameRu: 'Parity',
          nameEn: 'Parity',
          isActive: true,
        },
      });
    }

    let supplier = await tx.supplier.findFirst({ where: { deletedAt: null } });
    if (!supplier) {
      supplier = await tx.supplier.create({
        data: { name: 'China Parity Supplier', country: 'CN', isActive: true },
      });
    }

    const receivedAt = new Date('2026-01-15T10:00:00Z');

    const order = await tx.procurementOrder.create({
      data: {
        orderNumber: REPRO_ORDER_NUMBER,
        supplierId: supplier.id,
        hqWarehouseId: wh.id,
        status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
        landedCostStatus: ProcurementLandedCostStatus.FINALIZED,
        createdById: user.id,
        createdAt: new Date('2026-01-01T08:00:00Z'),
        hqStockMovementCreatedAt: receivedAt,
        receivedToHqAt: receivedAt,
        totalCostKgs: authoritativeTotal,
      },
    });

    const receiving = await tx.procurementGoodsReceiving.create({
      data: {
        receivingNumber: 'PGR-CHINA-PARITY-REPRO',
        procurementOrderId: order.id,
        hqWarehouseId: wh.id,
        receivedById: user.id,
        receivedAt,
        createdAt: receivedAt,
      },
    });

    let buggyMovementSum = 0;

    for (let index = 0; index < lineTotals.length; index++) {
      const authoritativeLineTotal = lineTotals[index]!;
      const sku = `CHINA-PARITY-${String(index).padStart(3, '0')}`;
      const unitCost = deriveDisplayUnitCost(authoritativeLineTotal, LINE_QUANTITY);
      const finalCostKgs = unitCost;

      const product = await tx.product.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          categoryId: cat.id,
          name: `Parity product ${index}`,
          sku,
          category: cat.code,
          unit: 'шт',
          finalCostKgs,
          costPriceKgs: finalCostKgs,
          purchaseCostKgs: roundDisplayMoney(authoritativeLineTotal * 0.6),
          transportCostKgs: roundDisplayMoney(authoritativeLineTotal * 0.4),
          sellingPriceKgs: roundDisplayMoney(finalCostKgs * 1.5),
          isActive: true,
        },
      });

      const orderItem = await tx.procurementOrderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          sku,
          productName: product.name,
          status: ProcurementOrderItemStatus.ACTIVE,
          quantity: LINE_QUANTITY,
          receivedQuantity: LINE_QUANTITY,
          purchasePriceYuan: 0,
          yuanRate: 0,
          costKgs: roundDisplayMoney(authoritativeLineTotal * 0.6 / LINE_QUANTITY),
          transportCostKgs: roundDisplayMoney(authoritativeLineTotal * 0.4),
          weightKg: 1,
          finalCostKgs,
          totalCostKgs: authoritativeLineTotal,
          totalYuan: 0,
        },
      });

      await tx.procurementGoodsReceivingItem.create({
        data: {
          receivingId: receiving.id,
          procurementItemId: orderItem.id,
          productId: product.id,
          sku,
          productName: product.name,
          expectedQuantity: LINE_QUANTITY,
          receivedQuantity: LINE_QUANTITY,
          differenceQuantity: 0,
        },
      });

      // Legacy bug: persist round(unit)×qty instead of authoritative line total.
      const buggyMovementTotal = roundDisplayMoney(unitCost * LINE_QUANTITY);
      buggyMovementSum += buggyMovementTotal;

      const movement = await tx.stockMovement.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          productId: product.id,
          type: StockMovementType.IN,
          quantity: LINE_QUANTITY,
          unitCostKgs: unitCost,
          totalCostKgs: buggyMovementTotal,
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
          referenceId: receiving.id,
          createdById: user.id,
          createdAt: receivedAt,
        },
      });

      await tx.fifoInventoryBatch.create({
        data: {
          productId: product.id,
          warehouseId: wh.id,
          stockMovementId: movement.id,
          unitCostKgs: unitCost,
          initialQuantity: LINE_QUANTITY,
          remainingQuantity: LINE_QUANTITY,
          receivedAt,
        },
      });

      await tx.inventoryBalance.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          productId: product.id,
          quantity: LINE_QUANTITY,
          averageCostKgs: unitCost,
          landedCostKgs: unitCost,
          totalValueKgs: buggyMovementTotal,
          lastReceivingAt: receivedAt,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          orderId: order.id,
          receivingId: receiving.id,
          authoritativePurchaseTotal: authoritativeTotal,
          buggyMovementTotal: roundDisplayMoney(buggyMovementSum),
          driftKgs: roundDisplayMoney(authoritativeTotal - roundDisplayMoney(buggyMovementSum)),
        },
        null,
        2,
      ),
    );
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
