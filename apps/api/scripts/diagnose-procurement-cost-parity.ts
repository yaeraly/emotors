/**
 * Independent China procurement cost diagnosis — does not assume which displayed total is correct.
 *
 * Recalculates expected purchase cost from source fields (yuan price, rate, logistics allocations)
 * and compares every persisted/display stage.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/diagnose-procurement-cost-parity.ts [--order-id=...]
 */
import { PrismaClient, StockMovementType } from '@prisma/client';
import {
  calculateLandedCosts,
  extractCargoConfig,
  extractLogisticsCosts,
  mapStoredProcurementItemToLandedCostInput,
} from '../src/procurement/landed-cost.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';
import { HQ_CATALOG_BRANCH_CODE } from '../src/warehouse/warehouse.util';

type Args = { orderId?: string };

function parseArgs(argv: string[]): Args {
  const orderArg = argv.find((a) => a.startsWith('--order-id='));
  return { orderId: orderArg ? orderArg.slice('--order-id='.length) : undefined };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

function lineCostFromPersistedSourceFields(item: {
  quantity: number;
  receivedQuantity: number | null;
  costKgs: unknown;
  transportCostKgs: unknown;
  chinaDomesticAllocKgs: unknown;
  chinaExportAllocKgs: unknown;
  localTransportAllocKgs: unknown;
  packagingAllocKgs: unknown;
  customsAllocKgs: unknown;
  insuranceAllocKgs: unknown;
  bankFeeAllocKgs: unknown;
  otherAllocKgs: unknown;
}) {
  const effectiveQty = item.receivedQuantity ?? item.quantity;
  const supplierLineCostKgs = roundDisplayMoney(n(item.costKgs) * effectiveQty);
  const allocatedAdditionalCost = roundDisplayMoney(
    n(item.chinaDomesticAllocKgs) +
      n(item.chinaExportAllocKgs) +
      n(item.localTransportAllocKgs) +
      n(item.packagingAllocKgs) +
      n(item.customsAllocKgs) +
      n(item.insuranceAllocKgs) +
      n(item.bankFeeAllocKgs) +
      n(item.otherAllocKgs) +
      n(item.transportCostKgs),
  );
  return roundDisplayMoney(supplierLineCostKgs + allocatedAdditionalCost);
}

function legacyUnitTimesQtyTotal(
  lines: Array<{ totalOrUnit: number; quantity: number; useUnit: boolean }>,
) {
  return roundDisplayMoney(
    lines.reduce((sum, line) => {
      const unit = line.useUnit
        ? line.totalOrUnit
        : deriveDisplayUnitCost(line.totalOrUnit, line.quantity);
      return sum + unit * line.quantity;
    }, 0),
  );
}

async function findTargetOrder(prisma: PrismaClient, orderId?: string) {
  const include = {
    hqWarehouse: { select: { id: true, name: true, code: true } },
    supplier: { select: { id: true, name: true, country: true } },
    items: {
      orderBy: { createdAt: 'asc' as const },
      include: { product: { select: { id: true, name: true, sku: true } } },
    },
    receivings: {
      orderBy: { createdAt: 'asc' as const },
      include: { items: true },
    },
  };

  if (orderId) {
    return prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include,
    });
  }

  return prisma.procurementOrder.findFirst({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include,
  });
}

function determineOutcome(input: {
  independentlyVerifiedTotal: number;
  storedPurchaseItemSum: number;
  displayedSupplyTotal: number;
  receiptTotal: number;
  branchSalesTotal: number;
}) {
  const eps = 0.009;
  const purchaseEps = 0.05;
  const verifiedMatchesStored =
    Math.abs(input.independentlyVerifiedTotal - input.storedPurchaseItemSum) < purchaseEps;
  const verifiedTotal = verifiedMatchesStored
    ? input.storedPurchaseItemSum
    : input.independentlyVerifiedTotal;

  const invCorrect = Math.abs(input.branchSalesTotal - verifiedTotal) < eps;
  const purchaseStoredCorrect = Math.abs(input.storedPurchaseItemSum - verifiedTotal) < eps;
  const purchaseDisplayCorrect = Math.abs(input.displayedSupplyTotal - verifiedTotal) < eps;

  if (purchaseStoredCorrect && purchaseDisplayCorrect && !invCorrect) {
    return {
      outcome: 'A',
      summary:
        'Independently verified purchase cost matches stored/displayed purchase totals; HQ inventory is wrong.',
      wrongValue: input.branchSalesTotal,
      correctValue: verifiedTotal,
    };
  }
  if (!purchaseStoredCorrect && !purchaseDisplayCorrect && invCorrect) {
    return {
      outcome: 'B',
      summary:
        'Inventory matches independent verification; Supply purchase calculation/display is wrong.',
      wrongValue: input.displayedSupplyTotal,
      correctValue: verifiedTotal,
    };
  }
  if (!purchaseStoredCorrect && invCorrect) {
    return {
      outcome: 'B',
      summary: 'Stored purchase lines disagree with source recalculation; inventory matches verified total.',
      wrongValue: input.storedPurchaseItemSum,
      correctValue: verifiedTotal,
    };
  }
  if (!purchaseStoredCorrect && !invCorrect) {
    return {
      outcome: 'C',
      summary: 'Both purchase and inventory differ from independent source recalculation.',
      wrongValue: null,
      correctValue: verifiedTotal,
    };
  }
  if (purchaseStoredCorrect && !purchaseDisplayCorrect && invCorrect) {
    return {
      outcome: 'B',
      summary: 'Display aggregation uses unit×qty drift; stored lines and inventory match verified total.',
      wrongValue: input.displayedSupplyTotal,
      correctValue: verifiedTotal,
    };
  }
  return {
    outcome: 'NONE',
    summary: 'All stages match independently verified total.',
    wrongValue: null,
    correctValue: verifiedTotal,
  };
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

  const exchangeRate = n(order.weightedAverageYuanRate ?? order.defaultYuanRate);
  const logistics = extractLogisticsCosts(order);
  const cargo = extractCargoConfig(order);

  const landedInputs = order.items.map((item) =>
    mapStoredProcurementItemToLandedCostInput({
      ...item,
      yuanRate: exchangeRate > 0 ? exchangeRate : n(item.yuanRate),
    }),
  );

  let independentRecalc: ReturnType<typeof calculateLandedCosts> | null = null;
  let independentRecalcError: string | null = null;
  try {
    independentRecalc = calculateLandedCosts(landedInputs, logistics, { cargo });
  } catch (error) {
    independentRecalcError = error instanceof Error ? error.message : String(error);
  }

  const independentlyVerifiedLineByItemId = new Map(
    order.items.map((item, index) => {
      const recalcItem = independentRecalc?.items[index];
      const supplierLineCostKgs = roundDisplayMoney(
        n(item.costKgs) * (item.receivedQuantity ?? item.quantity),
      );
      const fromPersistedSourceParts = lineCostFromPersistedSourceFields(item);
      const expectedFinalLineCost = recalcItem?.totalCostKgs
        ? recalcItem.totalCostKgs
        : fromPersistedSourceParts;

      return [
        item.id,
        {
          exchangeRate: exchangeRate > 0 ? exchangeRate : n(item.yuanRate),
          originalSupplierCostYuan: n(item.purchasePriceYuan),
          supplierLineCostKgs,
          allocatedAdditionalCost: roundDisplayMoney(expectedFinalLineCost - supplierLineCostKgs),
          expectedFinalLineCost,
          expectedUnitCost: deriveDisplayUnitCost(expectedFinalLineCost, item.quantity),
          fromIndependentRecalc: recalcItem?.totalCostKgs ?? null,
          fromPersistedSourceParts,
        },
      ] as const;
    }),
  );

  const verificationMethod =
    independentRecalc && independentRecalc.totalCostKgs > 0
      ? 'calculateLandedCosts_from_yuan_rate_logistics'
      : 'persisted_source_fields_costKgs_plus_allocations';

  const A_independentlyVerifiedTotal =
    independentRecalc && independentRecalc.totalCostKgs > 0
      ? independentRecalc.totalCostKgs
      : sumDisplayMoneyTotals(
          order.items.map((item) => lineCostFromPersistedSourceFields(item)),
        );

  const B_storedPurchaseItemSum = roundDisplayMoney(
    order.items.reduce((sum, item) => sum + n(item.totalCostKgs), 0),
  );
  const B_orderHeaderTotal = roundDisplayMoney(n(order.totalCostKgs));

  const scmPreviewLineSum =
    independentRecalc && independentRecalc.totalCostKgs > 0
      ? sumDisplayMoneyTotals(independentRecalc.items.map((item) => item.totalCostKgs))
      : B_storedPurchaseItemSum;

  const scmLegacyFooterSum = legacyUnitTimesQtyTotal(
    order.items.map((item) => ({
      totalOrUnit: n(item.finalCostKgs),
      quantity: item.quantity,
      useUnit: true,
    })),
  );

  const C_displayedSupplyTotal = scmPreviewLineSum;

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

  const D_receiptTotal = roundDisplayMoney(movements.reduce((sum, m) => sum + n(m.totalCostKgs), 0));
  const receiptLegacyUnitTimesQty = legacyUnitTimesQtyTotal(
    movements.map((m) => ({
      totalOrUnit: n(m.unitCostKgs),
      quantity: Math.abs(n(m.quantity)),
      useUnit: true,
    })),
  );

  const fifoLayerTotals = fifoBatches.map((batch) => {
    const movement = movements.find((m) => m.id === batch.stockMovementId);
    if (movement && n(movement.totalCostKgs) > 0) return n(movement.totalCostKgs);
    return roundDisplayMoney(n(batch.unitCostKgs) * batch.initialQuantity);
  });
  const E_fifoTotal = sumDisplayMoneyTotals(fifoLayerTotals);

  const F_qtyTimesUnitSum = roundDisplayMoney(
    balances.reduce((sum, b) => sum + n(b.quantity) * n(b.landedCostKgs ?? b.averageCostKgs), 0),
  );
  const G_branchSalesTotal = roundDisplayMoney(
    balances.reduce((sum, b) => sum + n(b.totalValueKgs), 0),
  );

  const reconciliationRows = order.items.map((item) => {
    const verified = independentlyVerifiedLineByItemId.get(item.id)!;
    const itemMovements = movements.filter((m) => m.productId === item.productId);
    const storedPurchaseLineCost = roundDisplayMoney(n(item.totalCostKgs));
    const receiptLineCost = roundDisplayMoney(
      itemMovements.reduce((sum, m) => sum + n(m.totalCostKgs), 0),
    );
    const movement = itemMovements[0];
    const inventoryLayerCost =
      movement && n(movement.totalCostKgs) > 0
        ? n(movement.totalCostKgs)
        : itemMovements.length
          ? roundDisplayMoney(
              itemMovements.reduce(
                (sum, m) => sum + n(m.unitCostKgs) * Math.abs(n(m.quantity)),
                0,
              ),
            )
          : 0;
    const balance = balances.find((b) => b.productId === item.productId);
    const branchSalesCost = balance ? n(balance.totalValueKgs) : 0;
    const difference = roundDisplayMoney(verified.expectedFinalLineCost - inventoryLayerCost);

    return {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      originalSupplierCostYuan: verified.originalSupplierCostYuan,
      exchangeRate: verified.exchangeRate,
      supplierLineCostKgs: verified.supplierLineCostKgs,
      allocatedAdditionalCost: verified.allocatedAdditionalCost,
      expectedFinalLineCost: verified.expectedFinalLineCost,
      expectedUnitCost: verified.expectedUnitCost,
      storedPurchaseLineCost,
      receiptLineCost,
      inventoryLayerCost,
      branchSalesCost,
      difference,
      movementIds: itemMovements.map((m) => m.id),
      fifoLayerIds: itemMovements
        .map((m) => fifoBatches.find((b) => b.stockMovementId === m.id)?.id)
        .filter(Boolean),
    };
  });

  reconciliationRows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const sumLineDifferences = roundDisplayMoney(
    reconciliationRows.reduce((sum, row) => sum + row.difference, 0),
  );

  const stageTotals = {
    A_independentlyVerifiedTotal,
    B_storedPurchaseItemSum,
    B_orderHeaderTotal,
    C_displayedSupplyTotal,
    C_legacyScmFooterUnitTimesQty: scmLegacyFooterSum,
    D_receiptMovementTotal: D_receiptTotal,
    D_receiptLegacyUnitTimesQty: receiptLegacyUnitTimesQty,
    E_fifoLayerTotal: E_fifoTotal,
    F_hqBranchQtyTimesUnit: F_qtyTimesUnitSum,
    G_branchSalesBalanceTotal: G_branchSalesTotal,
  };

  const stageDeltas = {
    A_minus_B: roundDisplayMoney(A_independentlyVerifiedTotal - B_storedPurchaseItemSum),
    B_minus_C: roundDisplayMoney(B_storedPurchaseItemSum - C_displayedSupplyTotal),
    C_minus_D: roundDisplayMoney(C_displayedSupplyTotal - D_receiptTotal),
    D_minus_E: roundDisplayMoney(D_receiptTotal - E_fifoTotal),
    E_minus_F: roundDisplayMoney(E_fifoTotal - F_qtyTimesUnitSum),
    F_minus_G: roundDisplayMoney(F_qtyTimesUnitSum - G_branchSalesTotal),
    verified_minus_G: roundDisplayMoney(A_independentlyVerifiedTotal - G_branchSalesTotal),
  };

  const firstIncorrectStage = (() => {
    const eps = 0.009;
    if (Math.abs(stageDeltas.A_minus_B) >= eps) return 'stored_purchase_items_vs_independent_recalc';
    if (Math.abs(stageDeltas.B_minus_C) >= eps) return 'stored_purchase_vs_supply_display';
    if (Math.abs(stageDeltas.C_minus_D) >= eps) return 'supply_display_vs_hq_receipt';
    if (Math.abs(stageDeltas.D_minus_E) >= eps) return 'hq_receipt_vs_fifo_layers';
    if (Math.abs(stageDeltas.E_minus_F) >= eps) return 'fifo_layers_vs_qty_times_unit';
    if (Math.abs(stageDeltas.F_minus_G) >= eps) return 'qty_times_unit_vs_balance_total';
    return 'none';
  })();

  const outcome = determineOutcome({
    independentlyVerifiedTotal: A_independentlyVerifiedTotal,
    storedPurchaseItemSum: B_storedPurchaseItemSum,
    displayedSupplyTotal: C_displayedSupplyTotal,
    receiptTotal: D_receiptTotal,
    branchSalesTotal: G_branchSalesTotal,
  });

  const report = {
    step1: {
      purchaseId: order.id,
      orderNumber: order.orderNumber,
      supplier: order.supplier,
      purchaseItemIds: order.items.map((i) => i.id),
      productIds: order.items.map((i) => i.productId),
      receiptIds: order.receivings.map((r) => r.id),
      inventoryMovementIds: movements.map((m) => m.id),
      fifoLayerIds: fifoBatches.map((b) => b.id),
      hqWarehouseId: order.hqWarehouseId,
      hqWarehouse: order.hqWarehouse,
      hqBranchId: hqBranch?.id ?? null,
      hqBranch,
      sourceFields: {
        defaultYuanRate: n(order.defaultYuanRate),
        weightedAverageYuanRate: n(order.weightedAverageYuanRate),
        totalYuan: n(order.totalYuan),
        totalPaidYuan: n(order.totalPaidYuan),
        estimatedSupplierCostKgs: n(order.estimatedSupplierCostKgs),
        logistics: logistics,
        cargo: cargo,
        totalTransportCostKgs: n(order.totalTransportCostKgs),
      },
      independentRecalcError,
      verificationMethod,
    },
    step2: {
      independentlyVerifiedTotal: A_independentlyVerifiedTotal,
      displayedPurchaseTotal: C_displayedSupplyTotal,
      storedPurchaseItemSum: B_storedPurchaseItemSum,
      storedOrderHeaderTotal: B_orderHeaderTotal,
      receiptTotal: D_receiptTotal,
      fifoInventoryTotal: E_fifoTotal,
      hqBranchTotal: G_branchSalesTotal,
      branchSalesTotal: G_branchSalesTotal,
      legacyScmFooterUnitTimesQty: scmLegacyFooterSum,
      receiptLegacyUnitTimesQty,
    },
    step3: {
      sumLineDifferences,
      reconciliationTable: reconciliationRows,
    },
    step4: {
      stageTotals,
      stageDeltas,
      firstIncorrectStage,
    },
    outcome,
    mandatoryTotals: {
      verifiedPurchaseTotal: A_independentlyVerifiedTotal,
      hqReceiptTotal: D_receiptTotal,
      fifoLayerTotal: E_fifoTotal,
      hqBranchTotal: G_branchSalesTotal,
      branchSalesTotal: G_branchSalesTotal,
      difference: roundDisplayMoney(A_independentlyVerifiedTotal - G_branchSalesTotal),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
