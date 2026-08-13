/**
 * Lineage-based inventory cost reconciliation / repair.
 *
 * Default: DRY RUN. Prints record ID, product, source cost, destination cost, difference.
 * Mutates only with --apply. Never hardcodes expected totals.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/reconcile-inventory-cost-lineage.ts
 *   cd apps/api && npx tsx scripts/reconcile-inventory-cost-lineage.ts --apply
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  remainingFifoLayerMoney,
  toExactMoney,
  toExactUnitCost,
  toMoneyDecimal,
  toStoredMoneyKgs,
} from '../src/common/money/money';
import { buildFifoLayerMoneyFromLine } from '../src/common/money/fifo-layer-cost';

const apply = process.argv.includes('--apply');

type Row = {
  recordId: string;
  product: string;
  sourceCost: string;
  destinationCost: string;
  difference: string;
  action: string;
};

function moneyStr(value: unknown): string {
  return toMoneyDecimal(value).toFixed();
}

async function main() {
  const prisma = new PrismaClient();
  const rows: Row[] = [];
  try {
    const batches = await prisma.fifoInventoryBatch.findMany({
      include: {
        product: { select: { sku: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const movementIds = batches
      .map((batch) => batch.stockMovementId)
      .filter((id): id is string => Boolean(id));
    const movements = movementIds.length
      ? await prisma.stockMovement.findMany({
          where: { id: { in: movementIds } },
          select: {
            id: true,
            totalCostKgs: true,
            unitCostKgs: true,
            quantity: true,
            referenceType: true,
            referenceId: true,
          },
        })
      : [];
    const movementById = new Map(movements.map((row) => [row.id, row]));

    for (const batch of batches) {
      const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : undefined;
      let source = toMoneyDecimal(0);
      if (movement && toMoneyDecimal(movement.totalCostKgs).gt(0)) {
        source = toExactMoney(movement.totalCostKgs);
      } else if (
        batch.referenceType &&
        batch.referenceId &&
        (batch.referenceType === 'PROCUREMENT_RECEIPT' ||
          batch.referenceType === 'PROCUREMENT_GOODS_RECEIVING')
      ) {
        const receivingItem = await prisma.procurementGoodsReceivingItem.findFirst({
          where: { receivingId: batch.referenceId, productId: batch.productId },
          select: { procurementItemId: true },
        });
        if (receivingItem?.procurementItemId) {
          const procItem = await prisma.procurementOrderItem.findUnique({
            where: { id: receivingItem.procurementItemId },
            select: { totalCostKgs: true },
          });
          if (procItem) source = toExactMoney(procItem.totalCostKgs);
        }
      }
      if (source.lte(0) && toMoneyDecimal(batch.originalLayerCostKgs).gt(0)) {
        source = toExactMoney(batch.originalLayerCostKgs);
      }
      if (source.lte(0)) continue;

      const expected = buildFifoLayerMoneyFromLine({
        quantity: batch.initialQuantity,
        authoritativeLineTotal: source,
        remainingQuantity: batch.remainingQuantity,
      });
      const destOriginal = toMoneyDecimal(batch.originalLayerCostKgs);
      const destRemaining = toMoneyDecimal(batch.remainingLayerCostKgs);
      const destUnit = toMoneyDecimal(batch.unitCostKgs);
      const originalDiff = expected.originalLayerCostKgs.minus(destOriginal);
      const remainingDiff = expected.remainingLayerCostKgs.minus(destRemaining);
      const unitDiff = expected.unitCostKgs.minus(destUnit);
      if (originalDiff.isZero() && remainingDiff.isZero() && unitDiff.isZero()) continue;

      rows.push({
        recordId: batch.id,
        product: `${batch.product.sku} ${batch.product.name}`.trim(),
        sourceCost: moneyStr(expected.originalLayerCostKgs),
        destinationCost: moneyStr(destOriginal.gt(0) ? destOriginal : destUnit.mul(batch.initialQuantity)),
        difference: moneyStr(originalDiff),
        action: 'fifo.layer',
      });

      if (apply) {
        await prisma.fifoInventoryBatch.update({
          where: { id: batch.id },
          data: {
            originalLayerCostKgs: expected.originalLayerCostKgs,
            remainingLayerCostKgs: expected.remainingLayerCostKgs,
            unitCostKgs: expected.unitCostKgs,
          },
        });
      }
    }

    const procItems = await prisma.procurementOrderItem.findMany({
      where: { quantity: { gt: 0 }, totalCostKgs: { gt: 0 } },
      select: {
        id: true,
        sku: true,
        productName: true,
        quantity: true,
        totalCostKgs: true,
        finalCostKgs: true,
      },
    });
    for (const item of procItems) {
      const exactUnit = toExactUnitCost(item.totalCostKgs, item.quantity);
      const storedUnit = toMoneyDecimal(item.finalCostKgs);
      if (exactUnit.eq(storedUnit)) continue;
      rows.push({
        recordId: item.id,
        product: `${item.sku} ${item.productName}`.trim(),
        sourceCost: moneyStr(exactUnit),
        destinationCost: moneyStr(storedUnit),
        difference: moneyStr(exactUnit.minus(storedUnit)),
        action: 'procurement.exactUnit',
      });
      if (apply) {
        await prisma.procurementOrderItem.update({
          where: { id: item.id },
          data: { finalCostKgs: exactUnit },
        });
      }
    }

    console.log(apply ? '========== APPLY ==========' : '========== DRY RUN ==========');
    console.log(`records: ${rows.length}`);
    for (const row of rows) {
      console.log(
        JSON.stringify({
          recordId: row.recordId,
          product: row.product,
          sourceCost: row.sourceCost,
          destinationCost: row.destinationCost,
          difference: row.difference,
          action: row.action,
          displayDifferenceKgs: toStoredMoneyKgs(row.difference),
        }),
      );
    }
    if (!apply) {
      console.log('No rows mutated. Re-run with --apply to persist lineage repairs.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

void remainingFifoLayerMoney;
void Prisma;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
