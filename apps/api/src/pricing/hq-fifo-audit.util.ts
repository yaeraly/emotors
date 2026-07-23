import {
  Prisma,
  PrismaClient,
  ProcurementOrderStatus,
  StockMovementType,
  WarehouseType,
} from '@prisma/client';
import {
  isBusinessProcurementReceiptReference,
  isSeedStockMovementReference,
} from './pricing-fifo-business-layer.util';
import {
  computeFifoRemainingFromMovement,
  computeFifoReservedOnBatch,
} from './pricing-fifo-remaining.util';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

export type HqFifoAuditFilters = {
  sku?: string;
  productId?: string;
  warehouseId?: string;
  receiptId?: string;
};

export type HqFifoProblemType =
  | 'PRODUCT_COST_MISMATCH'
  | 'INVENTORY_BALANCE_AVERAGE_MISMATCH'
  | 'COMPLETED_RECEIPT_MISSING_STOCK_MOVEMENT'
  | 'STOCK_MOVEMENT_MISSING_FIFO_BATCH'
  | 'FIFO_BATCH_MISSING_SOURCE'
  | 'RECEIVED_QUANTITY_MISMATCH'
  | 'INVENTORY_WITHOUT_ACTIVE_FIFO'
  | 'DUPLICATE_FIFO_BATCH_FOR_RECEIPT'
  | 'CROSS_WAREHOUSE_MISMATCH'
  | 'CROSS_BRANCH_MISMATCH'
  | 'LEGACY_SEED_LAYER';

export type HqFifoProductAuditRow = {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string | null;
  branchName: string | null;
  productCostPriceKgs: number | null;
  productFinalCostKgs: number | null;
  inventoryBalanceAverageCostKgs: number | null;
  oldestActiveFifoCostKgs: number | null;
  latestReceiptUnitCostKgs: number | null;
  inventoryQuantity: number;
  fifoRemainingQuantity: number;
  totalReceivedQuantity: number;
  fifoReceivedQuantity: number;
  problemTypes: HqFifoProblemType[];
  sourceReceiptIds: string[];
  sourceMovementIds: string[];
  legacySeedMovementIds: string[];
};

export type HqFifoAuditSummary = {
  productsAudited: number;
  productsWithProblems: number;
  completedReceiptsMissingStockMovement: number;
  completedReceiptsMissingFifoBatch: number;
  duplicateFifoBatches: number;
  crossWarehouseMismatches: number;
  crossBranchMismatches: number;
  legacySeedLayers: number;
  problemCounts: Record<HqFifoProblemType, number>;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function n(v: unknown) {
  return Number(v ?? 0);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function costsDiffer(a: number | null | undefined, b: number | null | undefined, tolerance = 0.01) {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) > tolerance;
}

export function isBusinessStockMovement(movement: {
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}) {
  return !isSeedStockMovementReference(movement);
}

export type CompletedReceiptItem = {
  procurementOrderId: string;
  procurementOrderItemId: string;
  procurementGoodsReceivingId: string;
  procurementGoodsReceivingItemId: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  branchId: string | null;
  receivedQuantity: number;
  totalLandedCostKgs: number;
  unitLandedCostKgs: number;
  receivedAt: Date;
};

export async function listCompletedChinaReceiptItems(
  client: DbClient,
  filters: HqFifoAuditFilters = {},
): Promise<CompletedReceiptItem[]> {
  const receivingItems = await client.procurementGoodsReceivingItem.findMany({
    where: {
      receivedQuantity: { gt: 0 },
      receiving: {
        deletedAt: null,
        ...(filters.receiptId ? { id: filters.receiptId } : {}),
        procurementOrder: {
          deletedAt: null,
          hqStockMovementCreatedAt: { not: null },
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
        },
      },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.sku ? { sku: { equals: filters.sku, mode: 'insensitive' } } : {}),
      ...(filters.warehouseId ? { receiving: { hqWarehouseId: filters.warehouseId } } : {}),
    },
    include: {
      receiving: {
        include: {
          procurementOrder: {
            select: {
              id: true,
              hqWarehouseId: true,
            },
          },
          hqWarehouse: {
            select: { id: true, branchId: true },
          },
        },
      },
    },
    orderBy: [{ receiving: { receivedAt: 'asc' } }, { createdAt: 'asc' }],
  });

  const rows: CompletedReceiptItem[] = [];
  for (const item of receivingItems) {
    const procurementItem = item.procurementItemId
      ? await client.procurementOrderItem.findUnique({
          where: { id: item.procurementItemId },
          select: {
            id: true,
            totalCostKgs: true,
            finalCostKgs: true,
            receivedQuantity: true,
          },
        })
      : null;
    const receivedQuantity = item.receivedQuantity;
    const totalLandedCostKgs = roundMoney(
      n(procurementItem?.totalCostKgs) > 0
        ? n(procurementItem?.totalCostKgs)
        : n(procurementItem?.finalCostKgs) * receivedQuantity,
    );
    if (receivedQuantity <= 0 || totalLandedCostKgs <= 0) continue;

    rows.push({
      procurementOrderId: item.receiving.procurementOrderId,
      procurementOrderItemId: item.procurementItemId ?? item.id,
      procurementGoodsReceivingId: item.receivingId,
      procurementGoodsReceivingItemId: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      warehouseId: item.receiving.hqWarehouseId,
      branchId: item.receiving.hqWarehouse?.branchId ?? null,
      receivedQuantity,
      totalLandedCostKgs,
      unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
        quantity: receivedQuantity,
        totalCostKgs: totalLandedCostKgs,
      }),
      receivedAt: item.receiving.receivedAt,
    });
  }
  return rows;
}

async function resolveHqFifoProductIds(client: DbClient, productId: string) {
  const ids = new Set<string>([productId]);
  const product = await client.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { sku: true },
  });
  const sku = product?.sku?.trim();
  if (!sku) return [...ids];
  const siblings = await client.product.findMany({
    where: { sku, deletedAt: null },
    select: { id: true },
  });
  for (const row of siblings) ids.add(row.id);
  return [...ids];
}

async function selectOldestActiveBusinessFifoCost(
  client: DbClient,
  productId: string,
  warehouseId: string,
) {
  const productIds = await resolveHqFifoProductIds(client, productId);
  const batches = await client.fifoInventoryBatch.findMany({
    where: {
      productId: { in: productIds },
      warehouseId,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const movementIds = batches
    .map((batch) => batch.stockMovementId)
    .filter((id): id is string => Boolean(id));
  const movements = movementIds.length
    ? await client.stockMovement.findMany({
        where: { id: { in: movementIds } },
        select: {
          id: true,
          quantity: true,
          unitCostKgs: true,
          totalCostKgs: true,
          referenceType: true,
          referenceId: true,
          note: true,
        },
      })
    : [];
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));

  for (const batch of batches) {
    const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
    if (
      isSeedStockMovementReference({
        referenceType: batch.referenceType,
        referenceId: batch.referenceId,
        note: movement?.note,
      }) ||
      (movement &&
        isSeedStockMovementReference({
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          note: movement.note,
        }))
    ) {
      continue;
    }

    const receivedQty = batch.initialQuantity > 0 ? batch.initialQuantity : 0;
    const unitCostKgs =
      movement && receivedQty > 0
        ? resolveUnitCostFromInventoryLayer({
            quantity: receivedQty,
            unitCostKgs: n(movement.unitCostKgs),
            totalCostKgs: n(movement.totalCostKgs),
          })
        : n(batch.unitCostKgs);

    if (unitCostKgs > 0) {
      return { batchId: batch.id, unitCostKgs, receivedAt: batch.receivedAt };
    }
  }
  return null;
}

export async function auditHqFifoInventory(
  client: DbClient,
  filters: HqFifoAuditFilters = {},
): Promise<{ summary: HqFifoAuditSummary; rows: HqFifoProductAuditRow[] }> {
  const problemCounts = Object.fromEntries(
    [
      'PRODUCT_COST_MISMATCH',
      'INVENTORY_BALANCE_AVERAGE_MISMATCH',
      'COMPLETED_RECEIPT_MISSING_STOCK_MOVEMENT',
      'STOCK_MOVEMENT_MISSING_FIFO_BATCH',
      'FIFO_BATCH_MISSING_SOURCE',
      'RECEIVED_QUANTITY_MISMATCH',
      'INVENTORY_WITHOUT_ACTIVE_FIFO',
      'DUPLICATE_FIFO_BATCH_FOR_RECEIPT',
      'CROSS_WAREHOUSE_MISMATCH',
      'CROSS_BRANCH_MISMATCH',
      'LEGACY_SEED_LAYER',
    ].map((key) => [key, 0]),
  ) as Record<HqFifoProblemType, number>;

  const balances = await client.inventoryBalance.findMany({
    where: {
      warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.sku ? { product: { sku: { equals: filters.sku, mode: 'insensitive' } } } : {}),
    },
    include: {
      product: { select: { id: true, sku: true, name: true, costPriceKgs: true, finalCostKgs: true, branchId: true } },
      warehouse: { select: { id: true, name: true, branchId: true } },
    },
  });

  const productWarehouseKeys = new Set(balances.map((b) => `${b.productId}:${b.warehouseId}`));

  const extraMovements = await client.stockMovement.findMany({
    where: {
      type: StockMovementType.IN,
      status: 'ACTIVE',
      quantity: { gt: 0 },
      warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.sku ? { product: { sku: { equals: filters.sku, mode: 'insensitive' } } } : {}),
    },
    select: { productId: true, warehouseId: true },
    distinct: ['productId', 'warehouseId'],
  });
  for (const row of extraMovements) {
    productWarehouseKeys.add(`${row.productId}:${row.warehouseId}`);
  }

  const receiptItems = await listCompletedChinaReceiptItems(client, filters);
  for (const receipt of receiptItems) {
    productWarehouseKeys.add(`${receipt.productId}:${receipt.warehouseId}`);
  }

  let completedReceiptsMissingStockMovement = 0;
  let completedReceiptsMissingFifoBatch = 0;
  let duplicateFifoBatches = 0;
  let crossWarehouseMismatches = 0;
  let crossBranchMismatches = 0;
  let legacySeedLayers = 0;

  const rows: HqFifoProductAuditRow[] = [];

  for (const key of productWarehouseKeys) {
    const [productId, warehouseId] = key.split(':');
    const balance = balances.find((b) => b.productId === productId && b.warehouseId === warehouseId);
    const product =
      balance?.product ??
      (await client.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true, sku: true, name: true, costPriceKgs: true, finalCostKgs: true, branchId: true },
      }));
    const warehouse =
      balance?.warehouse ??
      (await client.warehouse.findFirst({
        where: { id: warehouseId, deletedAt: null },
        select: { id: true, name: true, branchId: true },
      }));
    if (!product || !warehouse) continue;

    const branch = warehouse.branchId
      ? await client.branch.findUnique({
          where: { id: warehouse.branchId },
          select: { id: true, name: true },
        })
      : null;

    const productIdsForSku = await resolveHqFifoProductIds(client, productId);
    const oldestFifo = await selectOldestActiveBusinessFifoCost(client, productId, warehouseId);
    const productReceipts = receiptItems.filter(
      (r) => productIdsForSku.includes(r.productId) && r.warehouseId === warehouseId,
    );
    const latestReceipt = productReceipts.at(-1) ?? null;

    const movements = await client.stockMovement.findMany({
      where: {
        productId: { in: productIdsForSku },
        warehouseId,
        type: StockMovementType.IN,
        status: 'ACTIVE',
        quantity: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const businessMovements = movements.filter((m) => isBusinessStockMovement(m));
    const seedMovements = movements.filter((m) => !isBusinessStockMovement(m));

    const batches = await client.fifoInventoryBatch.findMany({
      where: { productId: { in: productIdsForSku }, warehouseId },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const businessBatches = [];
    for (const batch of batches) {
      const movement = batch.stockMovementId
        ? movements.find((m) => m.id === batch.stockMovementId)
        : null;
      if (
        isSeedStockMovementReference({
          referenceType: batch.referenceType,
          referenceId: batch.referenceId,
        }) ||
        (movement && !isBusinessStockMovement(movement))
      ) {
        legacySeedLayers += 1;
        continue;
      }
      businessBatches.push(batch);
    }

    const fifoRemainingQuantity = businessBatches.reduce((s, b) => s + b.remainingQuantity, 0);
    const fifoReceivedQuantity = businessBatches.reduce((s, b) => s + b.initialQuantity, 0);
    const totalReceivedQuantity = businessMovements.reduce((s, m) => s + Math.abs(n(m.quantity)), 0);
    const inventoryQuantity = balance?.quantity ?? 0;

    const problemTypes: HqFifoProblemType[] = [];
    const sourceReceiptIds = [...new Set(productReceipts.map((r) => r.procurementGoodsReceivingId))];
    const sourceMovementIds = businessMovements.map((m) => m.id);

    const oldestActiveFifoCostKgs = oldestFifo?.unitCostKgs ?? null;
    const productCostPriceKgs = n(product.costPriceKgs) || null;
    const productFinalCostKgs = n(product.finalCostKgs) || null;
    const inventoryBalanceAverageCostKgs = balance ? n(balance.averageCostKgs) || null : null;

    if (oldestActiveFifoCostKgs && costsDiffer(productCostPriceKgs, oldestActiveFifoCostKgs)) {
      problemTypes.push('PRODUCT_COST_MISMATCH');
      problemCounts.PRODUCT_COST_MISMATCH += 1;
    }
    if (oldestActiveFifoCostKgs && costsDiffer(inventoryBalanceAverageCostKgs, oldestActiveFifoCostKgs)) {
      problemTypes.push('INVENTORY_BALANCE_AVERAGE_MISMATCH');
      problemCounts.INVENTORY_BALANCE_AVERAGE_MISMATCH += 1;
    }
    if (inventoryQuantity > 0 && !oldestActiveFifoCostKgs) {
      problemTypes.push('INVENTORY_WITHOUT_ACTIVE_FIFO');
      problemCounts.INVENTORY_WITHOUT_ACTIVE_FIFO += 1;
    }

    for (const receipt of productReceipts) {
      const relatedMovements = movements.filter(
        (m) =>
          m.referenceType === 'PROCUREMENT_GOODS_RECEIVING' &&
          m.referenceId === receipt.procurementGoodsReceivingId &&
          m.productId === receipt.productId,
      );
      if (!relatedMovements.length) {
        problemTypes.push('COMPLETED_RECEIPT_MISSING_STOCK_MOVEMENT');
        problemCounts.COMPLETED_RECEIPT_MISSING_STOCK_MOVEMENT += 1;
        completedReceiptsMissingStockMovement += 1;
        continue;
      }
      if (relatedMovements.length > 1) {
        problemTypes.push('DUPLICATE_FIFO_BATCH_FOR_RECEIPT');
        problemCounts.DUPLICATE_FIFO_BATCH_FOR_RECEIPT += 1;
        duplicateFifoBatches += 1;
      }
      for (const movement of relatedMovements) {
        const fifo = batches.filter((b) => b.stockMovementId === movement.id);
        if (!fifo.length) {
          problemTypes.push('STOCK_MOVEMENT_MISSING_FIFO_BATCH');
          problemCounts.STOCK_MOVEMENT_MISSING_FIFO_BATCH += 1;
          completedReceiptsMissingFifoBatch += 1;
        } else if (fifo.length > 1) {
          problemTypes.push('DUPLICATE_FIFO_BATCH_FOR_RECEIPT');
          problemCounts.DUPLICATE_FIFO_BATCH_FOR_RECEIPT += 1;
          duplicateFifoBatches += 1;
        }
        const receivedQty = Math.abs(n(movement.quantity));
        const fifoBatch = fifo[0];
        if (fifoBatch && fifoBatch.initialQuantity !== receivedQty) {
          problemTypes.push('RECEIVED_QUANTITY_MISMATCH');
          problemCounts.RECEIVED_QUANTITY_MISMATCH += 1;
        }
        if (fifoBatch && !isBusinessProcurementReceiptReference(movement.referenceType) && !movement.referenceId) {
          problemTypes.push('FIFO_BATCH_MISSING_SOURCE');
          problemCounts.FIFO_BATCH_MISSING_SOURCE += 1;
        }
      }
    }

    for (const movement of businessMovements) {
      const fifo = batches.filter((b) => b.stockMovementId === movement.id);
      if (!fifo.length) {
        if (!problemTypes.includes('STOCK_MOVEMENT_MISSING_FIFO_BATCH')) {
          problemTypes.push('STOCK_MOVEMENT_MISSING_FIFO_BATCH');
          problemCounts.STOCK_MOVEMENT_MISSING_FIFO_BATCH += 1;
        }
      }
      if (movement.warehouseId !== warehouseId) {
        problemTypes.push('CROSS_WAREHOUSE_MISMATCH');
        problemCounts.CROSS_WAREHOUSE_MISMATCH += 1;
        crossWarehouseMismatches += 1;
      }
      if (product.branchId && warehouse.branchId && product.branchId !== warehouse.branchId) {
        problemTypes.push('CROSS_BRANCH_MISMATCH');
        problemCounts.CROSS_BRANCH_MISMATCH += 1;
        crossBranchMismatches += 1;
      }
    }

    if (seedMovements.length > 0 && businessMovements.length > 0) {
      if (!problemTypes.includes('LEGACY_SEED_LAYER')) {
        problemTypes.push('LEGACY_SEED_LAYER');
        problemCounts.LEGACY_SEED_LAYER += 1;
      }
    }

    const uniqueProblems = [...new Set(problemTypes)];
    if (!uniqueProblems.length && inventoryQuantity === 0 && !businessMovements.length && !productReceipts.length) {
      continue;
    }

    rows.push({
      productId,
      sku: product.sku,
      productName: product.name,
      warehouseId,
      warehouseName: warehouse.name,
      branchId: warehouse.branchId,
      branchName: branch?.name ?? null,
      productCostPriceKgs,
      productFinalCostKgs,
      inventoryBalanceAverageCostKgs,
      oldestActiveFifoCostKgs,
      latestReceiptUnitCostKgs: latestReceipt?.unitLandedCostKgs ?? null,
      inventoryQuantity,
      fifoRemainingQuantity,
      totalReceivedQuantity,
      fifoReceivedQuantity,
      problemTypes: uniqueProblems,
      sourceReceiptIds,
      sourceMovementIds,
      legacySeedMovementIds: seedMovements.map((m) => m.id),
    });
  }

  const productsWithProblems = rows.filter((r) => r.problemTypes.length > 0).length;
  return {
    summary: {
      productsAudited: rows.length,
      productsWithProblems,
      completedReceiptsMissingStockMovement,
      completedReceiptsMissingFifoBatch,
      duplicateFifoBatches,
      crossWarehouseMismatches,
      crossBranchMismatches,
      legacySeedLayers,
      problemCounts,
    },
    rows: rows.sort((a, b) => {
      if (b.problemTypes.length !== a.problemTypes.length) return b.problemTypes.length - a.problemTypes.length;
      return a.sku.localeCompare(b.sku);
    }),
  };
}

export type HqFifoRepairAction =
  | 'skipped_existing'
  | 'would_create_movement'
  | 'would_create_fifo'
  | 'would_repair_fifo'
  | 'created_movement'
  | 'created_fifo'
  | 'repaired_fifo'
  | 'skipped_seed'
  | 'skipped_ambiguous'
  | 'error';

export type HqFifoRepairResult = {
  productId: string;
  sku: string;
  warehouseId: string;
  procurementGoodsReceivingId?: string;
  procurementOrderItemId?: string;
  stockMovementId?: string;
  fifoLayerId?: string;
  receivedQuantity: number;
  unitLandedCostKgs: number;
  totalLandedCostKgs: number;
  action: HqFifoRepairAction;
  reason?: string;
};

export async function repairHqFifoFromReceipts(
  client: DbClient,
  filters: HqFifoAuditFilters,
  apply: boolean,
): Promise<HqFifoRepairResult[]> {
  const receiptItems = await listCompletedChinaReceiptItems(client, filters);
  const results: HqFifoRepairResult[] = [];

  for (const receipt of receiptItems) {
    const existingMovements = await client.stockMovement.findMany({
      where: {
        productId: receipt.productId,
        warehouseId: receipt.warehouseId,
        type: StockMovementType.IN,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        referenceId: receipt.procurementGoodsReceivingId,
      },
    });

    const businessMovements = existingMovements.filter((m) => isBusinessStockMovement(m));
    if (existingMovements.length > 1) {
      results.push({
        productId: receipt.productId,
        sku: receipt.sku,
        warehouseId: receipt.warehouseId,
        procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
        procurementOrderItemId: receipt.procurementOrderItemId,
        receivedQuantity: receipt.receivedQuantity,
        unitLandedCostKgs: receipt.unitLandedCostKgs,
        totalLandedCostKgs: receipt.totalLandedCostKgs,
        action: 'skipped_ambiguous',
        reason: `Multiple stock movements for receiving ${receipt.procurementGoodsReceivingId}`,
      });
      continue;
    }

    let movementId = businessMovements[0]?.id;
    if (!movementId) {
      if (!apply) {
        results.push({
          productId: receipt.productId,
          sku: receipt.sku,
          warehouseId: receipt.warehouseId,
          procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
          procurementOrderItemId: receipt.procurementOrderItemId,
          receivedQuantity: receipt.receivedQuantity,
          unitLandedCostKgs: receipt.unitLandedCostKgs,
          totalLandedCostKgs: receipt.totalLandedCostKgs,
          action: 'would_create_movement',
        });
      } else {
        const warehouse = await client.warehouse.findUnique({
          where: { id: receipt.warehouseId },
          select: { branchId: true },
        });
        const systemUser = await client.user.findFirst({
          where: { deletedAt: null },
          select: { id: true },
        });
        if (!warehouse?.branchId || !systemUser) {
          results.push({
            productId: receipt.productId,
            sku: receipt.sku,
            warehouseId: receipt.warehouseId,
            procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
            procurementOrderItemId: receipt.procurementOrderItemId,
            receivedQuantity: receipt.receivedQuantity,
            unitLandedCostKgs: receipt.unitLandedCostKgs,
            totalLandedCostKgs: receipt.totalLandedCostKgs,
            action: 'error',
            reason: 'HQ warehouse branchId or system user missing',
          });
          continue;
        }
        const movement = await client.stockMovement.create({
          data: {
            branchId: warehouse.branchId,
            warehouseId: receipt.warehouseId,
            productId: receipt.productId,
            type: StockMovementType.IN,
            quantity: receipt.receivedQuantity,
            unitCostKgs: receipt.unitLandedCostKgs,
            totalCostKgs: receipt.totalLandedCostKgs,
            status: 'ACTIVE',
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receipt.procurementGoodsReceivingId,
            createdAt: receipt.receivedAt,
            createdById: systemUser.id,
            note: `Backfill procurement receiving ${receipt.procurementGoodsReceivingId}`,
          },
        });
        movementId = movement.id;
        results.push({
          productId: receipt.productId,
          sku: receipt.sku,
          warehouseId: receipt.warehouseId,
          procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
          procurementOrderItemId: receipt.procurementOrderItemId,
          stockMovementId: movementId,
          receivedQuantity: receipt.receivedQuantity,
          unitLandedCostKgs: receipt.unitLandedCostKgs,
          totalLandedCostKgs: receipt.totalLandedCostKgs,
          action: 'created_movement',
        });
      }
    }

    if (!movementId) continue;

    const existingFifo = await client.fifoInventoryBatch.findFirst({
      where: { stockMovementId: movementId },
    });
    const remainingQuantity = await computeFifoRemainingFromMovement(
      client,
      movementId,
      receipt.receivedQuantity,
    );

    if (!existingFifo) {
      if (!apply) {
        results.push({
          productId: receipt.productId,
          sku: receipt.sku,
          warehouseId: receipt.warehouseId,
          procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
          procurementOrderItemId: receipt.procurementOrderItemId,
          stockMovementId: movementId,
          receivedQuantity: receipt.receivedQuantity,
          unitLandedCostKgs: receipt.unitLandedCostKgs,
          totalLandedCostKgs: receipt.totalLandedCostKgs,
          action: 'would_create_fifo',
        });
      } else {
        const created = await client.fifoInventoryBatch.create({
          data: {
            productId: receipt.productId,
            warehouseId: receipt.warehouseId,
            stockMovementId: movementId,
            receivedAt: receipt.receivedAt,
            unitCostKgs: receipt.unitLandedCostKgs,
            initialQuantity: receipt.receivedQuantity,
            remainingQuantity,
            reservedQuantity: 0,
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receipt.procurementGoodsReceivingId,
          },
        });
        results.push({
          productId: receipt.productId,
          sku: receipt.sku,
          warehouseId: receipt.warehouseId,
          procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
          procurementOrderItemId: receipt.procurementOrderItemId,
          stockMovementId: movementId,
          fifoLayerId: created.id,
          receivedQuantity: receipt.receivedQuantity,
          unitLandedCostKgs: receipt.unitLandedCostKgs,
          totalLandedCostKgs: receipt.totalLandedCostKgs,
          action: 'created_fifo',
        });
      }
      continue;
    }

    const reservedQuantity = await computeFifoReservedOnBatch(client, existingFifo.id);
    const needsRepair =
      Math.abs(n(existingFifo.unitCostKgs) - receipt.unitLandedCostKgs) > 0.009 ||
      existingFifo.initialQuantity !== receipt.receivedQuantity ||
      existingFifo.remainingQuantity !== remainingQuantity ||
      existingFifo.reservedQuantity !== reservedQuantity;

    if (!needsRepair) {
      results.push({
        productId: receipt.productId,
        sku: receipt.sku,
        warehouseId: receipt.warehouseId,
        procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
        procurementOrderItemId: receipt.procurementOrderItemId,
        stockMovementId: movementId,
        fifoLayerId: existingFifo.id,
        receivedQuantity: receipt.receivedQuantity,
        unitLandedCostKgs: receipt.unitLandedCostKgs,
        totalLandedCostKgs: receipt.totalLandedCostKgs,
        action: 'skipped_existing',
      });
      continue;
    }

    if (!apply) {
      results.push({
        productId: receipt.productId,
        sku: receipt.sku,
        warehouseId: receipt.warehouseId,
        procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
        procurementOrderItemId: receipt.procurementOrderItemId,
        stockMovementId: movementId,
        fifoLayerId: existingFifo.id,
        receivedQuantity: receipt.receivedQuantity,
        unitLandedCostKgs: receipt.unitLandedCostKgs,
        totalLandedCostKgs: receipt.totalLandedCostKgs,
        action: 'would_repair_fifo',
      });
      continue;
    }

    await client.fifoInventoryBatch.update({
      where: { id: existingFifo.id },
      data: {
        unitCostKgs: receipt.unitLandedCostKgs,
        initialQuantity: receipt.receivedQuantity,
        remainingQuantity,
        reservedQuantity,
      },
    });
    results.push({
      productId: receipt.productId,
      sku: receipt.sku,
      warehouseId: receipt.warehouseId,
      procurementGoodsReceivingId: receipt.procurementGoodsReceivingId,
      procurementOrderItemId: receipt.procurementOrderItemId,
      stockMovementId: movementId,
      fifoLayerId: existingFifo.id,
      receivedQuantity: receipt.receivedQuantity,
      unitLandedCostKgs: receipt.unitLandedCostKgs,
      totalLandedCostKgs: receipt.totalLandedCostKgs,
      action: 'repaired_fifo',
    });
  }

  const movementRepairs = await client.stockMovement.findMany({
    where: {
      type: StockMovementType.IN,
      status: 'ACTIVE',
      quantity: { gt: 0 },
      warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.sku ? { product: { sku: { equals: filters.sku, mode: 'insensitive' } } } : {}),
    },
    include: { product: { select: { sku: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const movement of movementRepairs) {
    if (!isBusinessStockMovement(movement)) {
      results.push({
        productId: movement.productId,
        sku: movement.product.sku,
        warehouseId: movement.warehouseId,
        stockMovementId: movement.id,
        receivedQuantity: Math.abs(n(movement.quantity)),
        unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
          quantity: Math.abs(n(movement.quantity)),
          unitCostKgs: n(movement.unitCostKgs),
          totalCostKgs: n(movement.totalCostKgs),
        }),
        totalLandedCostKgs: roundMoney(n(movement.totalCostKgs)),
        action: 'skipped_seed',
      });
      continue;
    }

    const receivedQty = Math.abs(n(movement.quantity));
    const unitLandedCostKgs = resolveUnitCostFromInventoryLayer({
      quantity: receivedQty,
      unitCostKgs: n(movement.unitCostKgs),
      totalCostKgs: n(movement.totalCostKgs),
    });
    const existing = await client.fifoInventoryBatch.findFirst({
      where: { stockMovementId: movement.id },
    });
    if (existing) continue;

    const remainingQuantity = await computeFifoRemainingFromMovement(client, movement.id, receivedQty);
    if (!apply) {
      results.push({
        productId: movement.productId,
        sku: movement.product.sku,
        warehouseId: movement.warehouseId,
        stockMovementId: movement.id,
        receivedQuantity: receivedQty,
        unitLandedCostKgs,
        totalLandedCostKgs: roundMoney(n(movement.totalCostKgs)),
        action: 'would_create_fifo',
      });
      continue;
    }

    const created = await client.fifoInventoryBatch.create({
      data: {
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        stockMovementId: movement.id,
        receivedAt: movement.createdAt,
        unitCostKgs: unitLandedCostKgs,
        initialQuantity: receivedQty,
        remainingQuantity,
        reservedQuantity: 0,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
      },
    });
    results.push({
      productId: movement.productId,
      sku: movement.product.sku,
      warehouseId: movement.warehouseId,
      stockMovementId: movement.id,
      fifoLayerId: created.id,
      receivedQuantity: receivedQty,
      unitLandedCostKgs,
      totalLandedCostKgs: roundMoney(n(movement.totalCostKgs)),
      action: 'created_fifo',
    });
  }

  return results;
}

export function parseHqFifoScriptArgs(argv: string[]): HqFifoAuditFilters & { apply: boolean; dryRun: boolean } {
  const skuArg = argv.find((a) => a.startsWith('--sku='));
  const productIdArg = argv.find((a) => a.startsWith('--product-id='));
  const warehouseIdArg = argv.find((a) => a.startsWith('--warehouse-id='));
  const receiptIdArg = argv.find((a) => a.startsWith('--receipt-id='));
  return {
    sku: skuArg ? skuArg.slice('--sku='.length) : undefined,
    productId: productIdArg ? productIdArg.slice('--product-id='.length) : undefined,
    warehouseId: warehouseIdArg ? warehouseIdArg.slice('--warehouse-id='.length) : undefined,
    receiptId: receiptIdArg ? receiptIdArg.slice('--receipt-id='.length) : undefined,
    apply: argv.includes('--apply'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply'),
  };
}
