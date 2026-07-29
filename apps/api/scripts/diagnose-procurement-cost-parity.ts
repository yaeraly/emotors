/**
 * Diagnose China procurement → HQ inventory cost parity for the first procurement order
 * (by creation time) or a specific order (--order-id=).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/diagnose-procurement-cost-parity.ts [--order-id=...]
 */
import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { recomputeInventoryBalanceValuation } from '../src/inventory/inventory-balance-valuation.util';
import { deriveDisplayUnitCost, roundDisplayMoney, sumDisplayMoneyTotals } from '../src/pricing/product-cost-precision.util';
import { HQ_CATALOG_BRANCH_CODE } from '../src/warehouse/warehouse.util';

type Args = { orderId?: string };

function parseArgs(argv: string[]): Args {
  const orderArg = argv.find((a) => a.startsWith('--order-id='));
  return { orderId: orderArg ? orderArg.slice('--order-id='.length) : undefined };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function findTargetOrder(prisma: PrismaClient, orderId?: string) {
  if (orderId) {
    return prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        hqWarehouse: { select: { id: true, name: true, code: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        receivings: {
          orderBy: { createdAt: 'asc' },
          include: { items: true },
        },
      },
    });
  }

  return prisma.procurementOrder.findFirst({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      hqWarehouse: { select: { id: true, name: true, code: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
      receivings: {
        orderBy: { createdAt: 'asc' },
        include: { items: true },
      },
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const order = await findTargetOrder(prisma, args.orderId);
  if (!order) {
    console.log(JSON.stringify({ error: 'No procurement order found' }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const hqBranch = await prisma.branch.findFirst({
    where: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null },
    select: { id: true, code: true, name: true },
  });

  const receivingIds = order.receivings.map((r) => r.id);
  const productIds = [...new Set(order.items.map((i) => i.productId))];

  const movements = await prisma.stockMovement.findMany({
    where: {
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: { in: receivingIds },
      type: StockMovementType.IN,
      productId: { in: productIds },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      branchId: true,
      quantity: true,
      unitCostKgs: true,
      totalCostKgs: true,
      referenceId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const fifoBatches = await prisma.fifoInventoryBatch.findMany({
    where: { stockMovementId: { in: movements.map((m) => m.id) } },
    select: {
      id: true,
      stockMovementId: true,
      productId: true,
      initialQuantity: true,
      remainingQuantity: true,
      unitCostKgs: true,
    },
  });

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      branchId: hqBranch?.id ?? undefined,
      warehouseId: order.hqWarehouseId,
      productId: { in: productIds },
    },
    select: {
      productId: true,
      quantity: true,
      averageCostKgs: true,
      landedCostKgs: true,
      totalValueKgs: true,
    },
  });

  const A = roundDisplayMoney(
    order.items.reduce((sum, item) => sum + n(item.totalCostKgs), 0),
  );
  const B = roundDisplayMoney(movements.reduce((sum, m) => sum + n(m.totalCostKgs), 0));

  const fifoLayerTotals = fifoBatches.map((batch) => {
    const movement = movements.find((m) => m.id === batch.stockMovementId);
    if (movement && n(movement.totalCostKgs) > 0) {
      return n(movement.totalCostKgs);
    }
    return roundDisplayMoney(n(batch.unitCostKgs) * batch.initialQuantity);
  });
  const C = sumDisplayMoneyTotals(fifoLayerTotals);

  const D = roundDisplayMoney(
    balances.reduce((sum, b) => sum + n(b.quantity) * n(b.landedCostKgs ?? b.averageCostKgs), 0),
  );
  const balanceTotalValue = roundDisplayMoney(
    balances.reduce((sum, b) => sum + n(b.totalValueKgs), 0),
  );
  const E = balanceTotalValue;

  const reconciliationRows = order.items.map((item) => {
    const itemMovements = movements.filter((m) => m.productId === item.productId);
    const receivedQty = item.receivedQuantity ?? item.quantity;
    const purchaseFinalLineCost = roundDisplayMoney(n(item.totalCostKgs));
    const supplierLineCost = roundDisplayMoney(n(item.costKgs) * receivedQty);
    const allocatedAdditionalCost = roundDisplayMoney(purchaseFinalLineCost - supplierLineCost);
    const purchaseUnitCost = deriveDisplayUnitCost(purchaseFinalLineCost, item.quantity);

    const receiptLineCost = roundDisplayMoney(
      itemMovements.reduce((sum, m) => sum + n(m.totalCostKgs), 0),
    );
    const receiptQty = itemMovements.reduce((sum, m) => sum + Math.abs(n(m.quantity)), 0);
    const receiptUnitCost =
      receiptQty > 0 ? deriveDisplayUnitCost(receiptLineCost, receiptQty) : 0;

    const batch = fifoBatches.find((b) =>
      itemMovements.some((m) => m.id === b.stockMovementId),
    );
    const movement = batch
      ? itemMovements.find((m) => m.id === batch.stockMovementId)
      : itemMovements[0];
    const inventoryLayerTotalCost =
      movement && n(movement.totalCostKgs) > 0
        ? n(movement.totalCostKgs)
        : batch
          ? roundDisplayMoney(n(batch.unitCostKgs) * batch.initialQuantity)
          : 0;
    const inventoryQty = batch?.remainingQuantity ?? balances.find((b) => b.productId === item.productId)?.quantity ?? 0;
    const inventoryLayerUnitCost = batch ? n(batch.unitCostKgs) : receiptUnitCost;

    const balance = balances.find((b) => b.productId === item.productId);
    const branchSalesCalculatedCost = balance ? n(balance.totalValueKgs) : 0;

    const lineDifference = roundDisplayMoney(purchaseFinalLineCost - inventoryLayerTotalCost);

    return {
      productId: item.productId,
      productName: item.productName,
      purchaseItemId: item.id,
      purchaseQuantity: item.quantity,
      receivedQuantity: receivedQty,
      supplierLineCost,
      allocatedAdditionalCost,
      purchaseFinalLineCost,
      purchaseUnitCost,
      receiptLineCost,
      receiptUnitCost,
      inventoryLayerTotalCost,
      inventoryLayerUnitCost,
      inventoryQuantity: inventoryQty,
      branchSalesCalculatedCost,
      lineDifference,
      movementIds: itemMovements.map((m) => m.id),
      fifoLayerIds: itemMovements
        .map((m) => fifoBatches.find((b) => b.stockMovementId === m.id)?.id)
        .filter(Boolean),
    };
  });

  reconciliationRows.sort(
    (a, b) => Math.abs(b.lineDifference) - Math.abs(a.lineDifference),
  );

  const sumLineDifferences = roundDisplayMoney(
    reconciliationRows.reduce((sum, row) => sum + row.lineDifference, 0),
  );

  const report = {
    step1: {
      purchaseId: order.id,
      orderNumber: order.orderNumber,
      purchaseItemIds: order.items.map((i) => i.id),
      receiptIds: order.receivings.map((r) => r.id),
      receiptItemIds: order.receivings.flatMap((r) => r.items.map((i) => i.id)),
      inventoryMovementIds: movements.map((m) => m.id),
      fifoLayerIds: fifoBatches.map((b) => b.id),
      hqWarehouseId: order.hqWarehouseId,
      hqWarehouse: order.hqWarehouse,
      hqBranchId: hqBranch?.id ?? null,
      hqBranch: hqBranch,
    },
    step2: {
      sumLineDifferences,
      reconciliationTable: reconciliationRows,
    },
    step3: {
      A_purchaseItemFinalCostSum: A,
      B_receiptMovementTotalCostSum: B,
      C_fifoLayerTotalCostSum: C,
      D_inventoryQtyTimesUnitCostSum: D,
      E_branchSalesInventoryBalanceTotal: E,
      A_minus_B: roundDisplayMoney(A - B),
      B_minus_C: roundDisplayMoney(B - C),
      C_minus_D: roundDisplayMoney(C - D),
      D_minus_E: roundDisplayMoney(D - E),
      firstNonZeroStage:
        A !== B
          ? 'purchase_items_vs_receipt_movements'
          : B !== C
            ? 'receipt_movements_vs_fifo_layers'
            : C !== D
              ? 'fifo_layers_vs_qty_times_unit'
              : D !== E
                ? 'qty_times_unit_vs_balance_total'
                : 'none',
    },
    mandatoryTotals: {
      purchaseTotal: A,
      hqReceiptTotal: B,
      fifoLayerTotal: C,
      hqBranchTotal: E,
      branchSalesTotal: E,
      difference: roundDisplayMoney(A - E),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
