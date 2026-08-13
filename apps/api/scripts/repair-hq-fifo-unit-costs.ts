/**
 * Diagnostic + repair for HQ FIFO unit costs (e.g. SUS001 showing InventoryBalance average).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-hq-fifo-unit-costs.ts [--sku=SUS001] [--apply]
 *
 * Default is dry-run (report only). Pass --apply to write repaired FifoInventoryBatch.unitCostKgs
 * from StockMovement.totalCostKgs ÷ received quantity.
 */
import { PrismaClient, StockMovementType, WarehouseType } from '@prisma/client';
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';

type Args = { sku?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const skuArg = argv.find((a) => a.startsWith('--sku='));
  return {
    sku: skuArg ? skuArg.slice('--sku='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(args.sku
        ? { sku: { equals: args.sku, mode: 'insensitive' } }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      finalCostKgs: true,
      costPriceKgs: true,
    },
    take: args.sku ? 50 : 5000,
  });

  const report: Array<Record<string, unknown>> = [];

  for (const product of products) {
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        productId: product.id,
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
      },
      select: {
        quantity: true,
        averageCostKgs: true,
        landedCostKgs: true,
        totalValueKgs: true,
        warehouseId: true,
      },
    });

    const batches = await prisma.fifoInventoryBatch.findMany({
      where: {
        productId: product.id,
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });

    if (!batches.length && !balances.length) continue;

    const avg =
      balances.length > 0
        ? n(balances[0].averageCostKgs) ||
          (n(balances[0].quantity) > 0
            ? Math.round((n(balances[0].totalValueKgs) / n(balances[0].quantity) + Number.EPSILON) * 100) /
              100
            : 0)
        : null;

    const layerRows = [];
    for (const batch of batches) {
      let movement = null as null | {
        id: string;
        quantity: number;
        unitCostKgs: unknown;
        totalCostKgs: unknown;
        referenceType: string | null;
        referenceId: string | null;
        createdAt: Date;
      };
      if (batch.stockMovementId) {
        movement = await prisma.stockMovement.findUnique({
          where: { id: batch.stockMovementId },
          select: {
            id: true,
            quantity: true,
            unitCostKgs: true,
            totalCostKgs: true,
            referenceType: true,
            referenceId: true,
            createdAt: true,
          },
        });
      }

      const receivedQty =
        batch.initialQuantity > 0
          ? batch.initialQuantity
          : Math.abs(n(movement?.quantity ?? 0));
      const correctUnit = resolveUnitCostFromInventoryLayer({
        quantity: receivedQty,
        unitCostKgs: n(movement?.unitCostKgs ?? batch.unitCostKgs),
        totalCostKgs: n(movement?.totalCostKgs ?? 0),
      });
      const storedUnit = n(batch.unitCostKgs);
      const matchesAverage =
        avg != null && avg > 0 && Math.abs(storedUnit - avg) < 0.02 && batches.length > 1;

      layerRows.push({
        batchId: batch.id,
        receivedAt: batch.receivedAt,
        initialQuantity: batch.initialQuantity,
        remainingQuantity: batch.remainingQuantity,
        storedUnitCostKgs: storedUnit,
        correctUnitCostKgs: correctUnit,
        matchesInventoryAverage: matchesAverage,
        movementId: movement?.id ?? null,
        movementTotalCostKgs: movement ? n(movement.totalCostKgs) : null,
        referenceType: movement?.referenceType ?? batch.referenceType,
        referenceId: movement?.referenceId ?? batch.referenceId,
        needsRepair: correctUnit > 0 && Math.abs(correctUnit - storedUnit) > 0.009,
      });

      if (args.apply && correctUnit > 0 && Math.abs(correctUnit - storedUnit) > 0.009) {
        await prisma.fifoInventoryBatch.update({
          where: { id: batch.id },
          data: { unitCostKgs: correctUnit },
        });
      }
    }

    const active = layerRows.find((l) => l.remainingQuantity > 0 && l.correctUnitCostKgs > 0);
    const suspicious =
      avg != null &&
      active &&
      Math.abs(n(active.storedUnitCostKgs) - avg) < 0.02 &&
      layerRows.some((l) => Math.abs(l.correctUnitCostKgs - avg) > 0.05);

    const productCostMatchesAverage =
      avg != null && avg > 0 && Math.abs(n(product.costPriceKgs) - avg) < 0.02;

    // Stale Product.costPriceKgs snapshot equal to inventory average — not a FIFO layer.
    // Safe to realign to active FIFO unit on --apply (does not rewrite historical orders).
    if (args.apply && productCostMatchesAverage && active && active.correctUnitCostKgs > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: { costPriceKgs: active.correctUnitCostKgs },
      });
    }

    if (
      args.sku ||
      suspicious ||
      productCostMatchesAverage ||
      layerRows.some((l) => l.needsRepair || l.matchesInventoryAverage)
    ) {
      report.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        productFinalCostKgs: n(product.finalCostKgs),
        productCostPriceKgs: n(product.costPriceKgs),
        productCostPriceMatchedInventoryAverage: productCostMatchesAverage,
        productCostPriceRepairedToActiveFifo:
          args.apply && productCostMatchesAverage && active
            ? active.correctUnitCostKgs
            : null,
        inventoryAverageCostKgs: avg,
        inventoryLandedCostKgs: balances[0] ? n(balances[0].landedCostKgs) : null,
        inventoryTotalValueKgs: balances[0] ? n(balances[0].totalValueKgs) : null,
        inventoryQty: balances[0] ? n(balances[0].quantity) : null,
        suspectedOriginOfDisplayedAverage:
          avg != null
            ? 'InventoryBalance.averageCostKgs (= totalValueKgs ÷ quantity weighted average across shipments)'
            : null,
        activeFifoLayer: active
          ? {
              batchId: active.batchId,
              remainingQuantity: active.remainingQuantity,
              correctUnitCostKgs: active.correctUnitCostKgs,
              previouslyStoredUnitCostKgs: active.storedUnitCostKgs,
            }
          : null,
        layers: layerRows,
      });
    }
  }

  // Also find IN movements without FIFO batches for reported SKUs
  if (args.sku) {
    for (const product of products) {
      const allIn = await prisma.stockMovement.findMany({
        where: {
          productId: product.id,
          type: StockMovementType.IN,
          status: 'ACTIVE',
          quantity: { gt: 0 },
          warehouse: { warehouseType: WarehouseType.HQ },
        },
        orderBy: { createdAt: 'asc' },
      });
      const linked = new Set(
        (
          await prisma.fifoInventoryBatch.findMany({
            where: { productId: product.id, stockMovementId: { not: null } },
            select: { stockMovementId: true },
          })
        )
          .map((b) => b.stockMovementId)
          .filter(Boolean),
      );
      const missing = allIn.filter((m) => !linked.has(m.id));
      if (missing.length) {
        report.push({
          note: 'HQ IN movements without FIFO layers',
          sku: product.sku,
          movements: missing.map((m) => ({
            id: m.id,
            qty: m.quantity,
            unitCostKgs: n(m.unitCostKgs),
            totalCostKgs: n(m.totalCostKgs),
            derivedUnit: resolveUnitCostFromInventoryLayer({
              quantity: Math.abs(m.quantity),
              unitCostKgs: n(m.unitCostKgs),
              totalCostKgs: n(m.totalCostKgs),
            }),
            createdAt: m.createdAt,
            referenceType: m.referenceType,
            referenceId: m.referenceId,
          })),
        });

        if (args.apply) {
          for (const m of missing) {
            const unit = resolveUnitCostFromInventoryLayer({
              quantity: Math.abs(m.quantity),
              unitCostKgs: n(m.unitCostKgs),
              totalCostKgs: n(m.totalCostKgs),
            });
            const existing = await prisma.fifoInventoryBatch.findFirst({
              where: { stockMovementId: m.id },
            });
            if (existing) continue;
            await prisma.fifoInventoryBatch.create({
              data: {
                productId: product.id,
                warehouseId: m.warehouseId,
                stockMovementId: m.id,
                receivedAt: m.createdAt,
                unitCostKgs: unit,
                initialQuantity: Math.abs(m.quantity),
                remainingQuantity: Math.abs(m.quantity),
                referenceType: m.referenceType,
                referenceId: m.referenceId,
              },
            });
          }
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        skuFilter: args.sku ?? null,
        productsScanned: products.length,
        findings: report,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
