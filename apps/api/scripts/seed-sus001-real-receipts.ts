/**
 * Inserts real SUS001 China receipt business data (15 + 10 units) through the
 * procurement receiving tables, then creates StockMovement + FifoInventoryBatch.
 *
 * Does NOT delete legacy seed layers — marks them SEED_REPRO if still present.
 *
 * Usage: cd apps/api && npx tsx scripts/seed-sus001-real-receipts.ts
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
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';
import { SEED_FIFO_REFERENCE_TYPE } from '../src/pricing/pricing-fifo-business-layer.util';

const p = new PrismaClient();

const RECEIPTS = [
  {
    label: 'Shipment 1',
    quantity: 15,
    totalLandedCostKgs: 24944.55,
    unitLandedCostKgs: 1662.97,
    receivedAt: new Date('2026-03-01T10:00:00Z'),
    orderSuffix: 'A',
  },
  {
    label: 'Shipment 2',
    quantity: 10,
    totalLandedCostKgs: 16541.95,
    unitLandedCostKgs: 1654.2,
    receivedAt: new Date('2026-03-15T10:00:00Z'),
    orderSuffix: 'B',
  },
] as const;

async function main() {
  await p.$transaction(async (tx) => {
    const hqBranch = await tx.branch.findFirst({ where: { code: 'EMOTORS-HQ' } });
    const wh = await tx.warehouse.findFirst({
      where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    });
    const user = await tx.user.findFirst({ where: { deletedAt: null } });
    if (!hqBranch || !wh || !user) {
      throw new Error('HQ branch, warehouse, and user required');
    }

    let product = await tx.product.findFirst({
      where: { sku: 'SUS001', branchId: hqBranch.id, deletedAt: null },
    });
    if (!product) {
      const cat = await tx.productCategory.findFirst({ where: { isActive: true } });
      if (!cat) throw new Error('Product category required');
      product = await tx.product.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          categoryId: cat.id,
          name: 'Амортизатор 43×72 (Ø1,5 см)',
          sku: 'SUS001',
          category: 'SUS',
          unit: 'шт',
          isActive: true,
        },
      });
    }

    // Mark legacy seed movements without deleting them.
    await tx.stockMovement.updateMany({
      where: {
        productId: product.id,
        referenceId: { in: ['recv-1', 'recv-2', 'seed-recv-1', 'seed-recv-2'] },
      },
      data: { referenceType: SEED_FIFO_REFERENCE_TYPE },
    });
    const seedMovementIds = (
      await tx.stockMovement.findMany({
        where: {
          productId: product.id,
          OR: [
            { referenceType: SEED_FIFO_REFERENCE_TYPE },
            { referenceId: { in: ['recv-1', 'recv-2', 'seed-recv-1', 'seed-recv-2'] } },
          ],
        },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (seedMovementIds.length) {
      await tx.fifoInventoryBatch.updateMany({
        where: { stockMovementId: { in: seedMovementIds } },
        data: { referenceType: SEED_FIFO_REFERENCE_TYPE },
      });
    }

    let supplier = await tx.supplier.findFirst({ where: { deletedAt: null } });
    if (!supplier) {
      supplier = await tx.supplier.create({
        data: {
          name: 'China Supplier (SUS001 real receipts seed)',
          country: 'CN',
          isActive: true,
        },
      });
    }

    const createdLayers = [];

    for (const receipt of RECEIPTS) {
      const existingMovement = await tx.stockMovement.findFirst({
        where: {
          productId: product.id,
          type: StockMovementType.IN,
          quantity: receipt.quantity,
          totalCostKgs: { gte: receipt.totalLandedCostKgs - 0.05, lte: receipt.totalLandedCostKgs + 0.05 },
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        },
      });
      if (existingMovement) {
        const batch = await tx.fifoInventoryBatch.findFirst({
          where: { stockMovementId: existingMovement.id },
        });
        createdLayers.push({
          receipt: receipt.label,
          status: 'already_exists',
          movementId: existingMovement.id,
          fifoLayerId: batch?.id ?? null,
        });
        continue;
      }

      const order = await tx.procurementOrder.create({
        data: {
          orderNumber: `SUS001-REAL-${receipt.orderSuffix}-${Date.now()}`,
          supplierId: supplier.id,
          hqWarehouseId: wh.id,
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
          landedCostStatus: ProcurementLandedCostStatus.FINALIZED,
          createdById: user.id,
          hqStockMovementCreatedAt: receipt.receivedAt,
          receivedToHqAt: receipt.receivedAt,
          totalCostKgs: receipt.totalLandedCostKgs,
        },
      });

      const item = await tx.procurementOrderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          status: ProcurementOrderItemStatus.ACTIVE,
          quantity: receipt.quantity,
          receivedQuantity: receipt.quantity,
          purchasePriceYuan: 0,
          yuanRate: 0,
          costKgs: 0,
          transportCostKgs: 0,
          weightKg: 1,
          finalCostKgs: receipt.unitLandedCostKgs,
          totalCostKgs: receipt.totalLandedCostKgs,
          totalYuan: 0,
        },
      });

      const receiving = await tx.procurementGoodsReceiving.create({
        data: {
          receivingNumber: `PGR-SUS001-${receipt.orderSuffix}`,
          procurementOrderId: order.id,
          hqWarehouseId: wh.id,
          receivedById: user.id,
          receivedAt: receipt.receivedAt,
        },
      });

      await tx.procurementGoodsReceivingItem.create({
        data: {
          receivingId: receiving.id,
          procurementItemId: item.id,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          expectedQuantity: receipt.quantity,
          receivedQuantity: receipt.quantity,
          differenceQuantity: 0,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          productId: product.id,
          type: StockMovementType.IN,
          quantity: receipt.quantity,
          unitCostKgs: receipt.unitLandedCostKgs,
          totalCostKgs: receipt.totalLandedCostKgs,
          status: 'ACTIVE',
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
          referenceId: receiving.id,
          createdById: user.id,
          createdAt: receipt.receivedAt,
          note: `Real SUS001 receipt ${receipt.label}`,
        },
      });

      const unitCost = resolveUnitCostFromInventoryLayer({
        quantity: receipt.quantity,
        totalCostKgs: receipt.totalLandedCostKgs,
      });

      const batch = await tx.fifoInventoryBatch.create({
        data: {
          productId: product.id,
          warehouseId: wh.id,
          stockMovementId: movement.id,
          receivedAt: receipt.receivedAt,
          unitCostKgs: unitCost,
          initialQuantity: receipt.quantity,
          remainingQuantity: receipt.quantity,
          reservedQuantity: 0,
          referenceType: 'PROCUREMENT_GOODS_RECEIVING',
          referenceId: receiving.id,
        },
      });

      const currentBal = await tx.inventoryBalance.findUnique({
        where: {
          branchId_warehouseId_productId: {
            branchId: hqBranch.id,
            warehouseId: wh.id,
            productId: product.id,
          },
        },
      });
      const prevQty = currentBal?.quantity ?? 0;
      const prevTotal = Number(currentBal?.totalValueKgs ?? 0);
      const nextQty = prevQty + receipt.quantity;
      const nextTotal = prevTotal + receipt.totalLandedCostKgs;
      await tx.inventoryBalance.upsert({
        where: {
          branchId_warehouseId_productId: {
            branchId: hqBranch.id,
            warehouseId: wh.id,
            productId: product.id,
          },
        },
        update: {
          quantity: nextQty,
          totalValueKgs: nextTotal,
          averageCostKgs: nextQty > 0 ? Math.round((nextTotal / nextQty) * 100) / 100 : 0,
          lastReceivingAt: receipt.receivedAt,
        },
        create: {
          branchId: hqBranch.id,
          warehouseId: wh.id,
          productId: product.id,
          quantity: receipt.quantity,
          totalValueKgs: receipt.totalLandedCostKgs,
          averageCostKgs: unitCost,
          lastReceivingAt: receipt.receivedAt,
        },
      });

      createdLayers.push({
        receipt: receipt.label,
        status: 'created',
        productId: product.id,
        sku: product.sku,
        procurementOrderId: order.id,
        receivingId: receiving.id,
        stockMovementId: movement.id,
        fifoLayerId: batch.id,
        receivedQuantity: receipt.quantity,
        remainingQuantity: receipt.quantity,
        unitLandedCostKgs: unitCost,
        totalLandedCostKgs: receipt.totalLandedCostKgs,
      });
    }

    console.log(JSON.stringify({ productId: product.id, sku: product.sku, layers: createdLayers }, null, 2));
  });

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
