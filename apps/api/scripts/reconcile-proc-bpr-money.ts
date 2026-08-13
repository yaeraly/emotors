/**
 * Trace and repair PROC-1786562989569 → BPR-1786565119536 money chain.
 *
 * Prints raw Decimal values, product-level differences, then optionally repairs
 * BPR derived totals from procurement authoritative line costs (never a lump
 * +0.82 patch, never unit × qty reconstruction).
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/reconcile-proc-bpr-money.ts
 *   cd apps/api && npx tsx scripts/reconcile-proc-bpr-money.ts --apply
 */
import { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { remainingFifoLayerMoney, toMoneyDecimal, toStoredMoneyKgs } from '../src/common/money/money';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../src/pricing/product-cost-precision.util';
import { planHqBranchBprRepairFromProcurement } from '../src/operations/repair-hq-branch-from-procurement.util';
import { planHqBranchBprRepairFromStoredFifo } from '../src/operations/repair-hq-branch-stored-fifo.util';

const PROC_NUMBER = 'PROC-1786562989569';
const BPR_NUMBER = 'BPR-1786565119536';
const apply = process.argv.includes('--apply');

function money(value: unknown): number {
  return toStoredMoneyKgs(toMoneyDecimal(value));
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const proc = await prisma.procurementOrder.findFirst({
      where: { orderNumber: PROC_NUMBER, deletedAt: null },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    const bpr = await prisma.branchPurchaseRequest.findFirst({
      where: { requestNumber: BPR_NUMBER, deletedAt: null },
      include: {
        branch: { select: { name: true, code: true, branchType: true } },
        items: { orderBy: { position: 'asc' } },
      },
    });

    console.log('========== STEP 1 — RAW DECIMAL TRACE ==========');
    if (!proc) {
      console.log('PROC NOT FOUND:', PROC_NUMBER);
    } else {
      const itemSum = money(
        proc.items.reduce((sum, item) => sum.plus(toMoneyDecimal(item.totalCostKgs)), new Prisma.Decimal(0)),
      );
      const productIds = proc.items.map((item) => item.productId);
      const fifoBatches = await prisma.fifoInventoryBatch.findMany({
        where: { productId: { in: productIds } },
      });
      const movementIds = fifoBatches
        .map((batch) => batch.stockMovementId)
        .filter((id): id is string => Boolean(id));
      const movements = movementIds.length
        ? await prisma.stockMovement.findMany({
            where: { id: { in: movementIds } },
            select: { id: true, totalCostKgs: true, unitCostKgs: true, quantity: true },
          })
        : [];
      const movementById = new Map(movements.map((row) => [row.id, row]));
      const procByProduct = new Map(proc.items.map((item) => [item.productId, item]));

      let fifoOriginal = new Prisma.Decimal(0);
      let fifoRemaining = new Prisma.Decimal(0);
      for (const batch of fifoBatches) {
        const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
        const procItem = procByProduct.get(batch.productId);
        const original = money(
          movement && money(movement.totalCostKgs) > 0
            ? movement.totalCostKgs
            : procItem
              ? procItem.totalCostKgs
              : toMoneyDecimal(batch.unitCostKgs).mul(batch.initialQuantity),
        );
        const remaining = toStoredMoneyKgs(
          remainingFifoLayerMoney({
            originalLayerCost: original,
            layerBaseQuantity: batch.initialQuantity,
            remainingQuantity: batch.remainingQuantity,
          }),
        );
        fifoOriginal = fifoOriginal.plus(toMoneyDecimal(original));
        fifoRemaining = fifoRemaining.plus(toMoneyDecimal(remaining));
      }
      const fifoConsumed = money(fifoOriginal.minus(fifoRemaining));

      console.log('Procurement ID:', proc.id);
      console.log('Procurement number:', proc.orderNumber);
      console.log('Procurement final landed / totalCostKgs:', money(proc.totalCostKgs));
      console.log('SUM procurement item totalCostKgs:', itemSum);
      console.log('SUM HQ FIFO original costs created:', money(fifoOriginal));
      console.log('SUM HQ FIFO remaining costs:', money(fifoRemaining));
      console.log('SUM HQ FIFO consumed costs:', fifoConsumed);
    }

    if (!bpr) {
      console.log('BPR NOT FOUND:', BPR_NUMBER);
    } else {
      const storedLines = money(
        bpr.items.reduce((sum, item) => sum.plus(toMoneyDecimal(item.totalAmount)), new Prisma.Decimal(0)),
      );
      const fifoSnapshots = money(
        bpr.items.reduce(
          (sum, item) => sum.plus(toMoneyDecimal(item.estimatedLineProductCostKgs)),
          new Prisma.Decimal(0),
        ),
      );
      const unitTimesQty = money(
        bpr.items.reduce((sum, item) => {
          const qty = item.approvedQuantity ?? item.quantity;
          const unit = money(item.resolvedBranchPriceKgs ?? item.estimatedUnitCost);
          return sum.plus(toMoneyDecimal(unit).times(qty));
        }, new Prisma.Decimal(0)),
      );
      let allocationCost = 0;
      if (bpr.convertedOrderId) {
        const allocations = await prisma.distributionFifoAllocation.findMany({
          where: { distributionOrderId: bpr.convertedOrderId },
        });
        allocationCost = money(
          allocations.reduce((sum, row) => sum.plus(toMoneyDecimal(row.totalCostKgs)), new Prisma.Decimal(0)),
        );
      }
      console.log('BPR ID:', bpr.id);
      console.log('BPR number:', bpr.requestNumber);
      console.log('Branch:', bpr.branch.name, bpr.branch.branchType);
      console.log('BPR stored totalEstimatedAmount:', money(bpr.totalEstimatedAmount));
      console.log('SUM BPR item totalAmount:', storedLines);
      console.log('SUM displayed unit × qty:', unitTimesQty);
      console.log('SUM BPR estimatedLineProductCostKgs (FIFO snapshot):', fifoSnapshots);
      console.log('SUM source FIFO allocation costs:', allocationCost);
    }

    if (!proc || !bpr) {
      console.log('Cannot continue product reconciliation without both records.');
      return;
    }

    console.log('\n========== STEP 2 — PRODUCT RECONCILIATION ==========');
    const procByProduct = new Map(proc.items.map((item) => [item.productId, item]));
    const procBySku = new Map(proc.items.map((item) => [item.sku.trim().toUpperCase(), item]));
    let diffSum = new Prisma.Decimal(0);
    const driftedRows: Array<{ sku: string; difference: number }> = [];
    for (const bprItem of bpr.items) {
      const procItem =
        procByProduct.get(bprItem.productId) ?? procBySku.get(bprItem.sku.trim().toUpperCase());
      const qty = bprItem.approvedQuantity ?? bprItem.quantity;
      const procCost = procItem ? money(procItem.totalCostKgs) : 0;
      const rawUnit =
        procItem && procItem.quantity > 0
          ? toStoredMoneyKgs(toMoneyDecimal(procCost).div(procItem.quantity))
          : 0;
      const bprUnit = money(bprItem.resolvedBranchPriceKgs ?? bprItem.estimatedUnitCost);
      const bprLine = money(bprItem.totalAmount);
      const fifoSnap = money(bprItem.estimatedLineProductCostKgs);
      const expected = procCost;
      const difference = roundDisplayMoney(bprLine - expected);
      diffSum = diffSum.plus(toMoneyDecimal(difference));
      if (Math.abs(difference) < 0.005) continue;
      driftedRows.push({ sku: bprItem.sku, difference });
      console.log('---');
      console.log('Product:', bprItem.productName);
      console.log('SKU:', bprItem.sku);
      console.log('Procurement qty:', procItem?.quantity ?? 'NOT FOUND');
      console.log('Procurement authoritative line cost:', procCost);
      console.log('Raw procurement unit cost:', rawUnit);
      console.log('BPR qty:', qty);
      console.log('BPR saved unit price:', bprUnit);
      console.log('BPR saved line total:', bprLine);
      console.log('BPR FIFO snapshot:', fifoSnap);
      console.log('Expected FIFO/procurement cost:', expected);
      console.log('Difference (BPR - PROC):', difference);
    }
    console.log('SUM all differences:', money(diffSum));
    console.log('Drifted SKU count:', driftedRows.length);

    const fromProc = planHqBranchBprRepairFromProcurement({
      branchType: bpr.branch.branchType,
      storedHeaderTotalKgs: bpr.totalEstimatedAmount,
      procurementItems: proc.items,
      bprItems: bpr.items,
    });
    const fromFifo = planHqBranchBprRepairFromStoredFifo({
      branchType: bpr.branch.branchType,
      storedHeaderTotalKgs: bpr.totalEstimatedAmount,
      items: bpr.items,
    });
    console.log('\n========== STEP 3 — FIRST BROKEN BOUNDARY ==========');
    const procTotal = money(proc.totalCostKgs);
    const procItemSum = money(
      proc.items.reduce((sum, item) => sum.plus(toMoneyDecimal(item.totalCostKgs)), new Prisma.Decimal(0)),
    );
    const bprStored = money(bpr.totalEstimatedAmount);
    const bprLines = money(
      bpr.items.reduce((sum, item) => sum.plus(toMoneyDecimal(item.totalAmount)), new Prisma.Decimal(0)),
    );
    const fifoSnapSum = money(
      bpr.items.reduce(
        (sum, item) => sum.plus(toMoneyDecimal(item.estimatedLineProductCostKgs)),
        new Prisma.Decimal(0),
      ),
    );
    const unitTimesQtySum = money(
      bpr.items.reduce((sum, item) => {
        const qty = item.approvedQuantity ?? item.quantity;
        const unit = money(item.resolvedBranchPriceKgs ?? item.estimatedUnitCost);
        return sum.plus(toMoneyDecimal(unit).times(qty));
      }, new Prisma.Decimal(0)),
    );
    const a = roundDisplayMoney(procTotal - procItemSum);
    const c = roundDisplayMoney(fifoSnapSum - bprStored);
    const d = roundDisplayMoney(bprLines - bprStored);
    const e = roundDisplayMoney(unitTimesQtySum - bprStored);
    console.log('A. PROC final vs SUM item costs:', a);
    console.log('C. FIFO snapshot vs BPR stored total:', c);
    console.log('D. SUM BPR lines vs BPR stored total:', d);
    console.log('E. unit×qty vs BPR stored total:', e);
    if (Math.abs(a) >= 0.005) {
      console.log('FIRST non-zero difference: A (procurement allocation)');
    } else if (Math.abs(roundDisplayMoney(procItemSum - fifoSnapSum)) >= 0.005) {
      console.log('FIRST non-zero difference: B/C (procurement vs BPR FIFO snapshot / transfer cost)');
    } else if (Math.abs(c) >= 0.005 || Math.abs(d) >= 0.005) {
      console.log('FIRST non-zero difference: D (BPR line totals vs header — unit×qty reconstruction)');
    } else if (Math.abs(e) >= 0.005) {
      console.log('FIRST non-zero difference: E (UI unit×qty vs stored). Stored BPR already matches FIFO.');
    } else {
      console.log('No monetary difference in stored records.');
    }

    console.log('\n========== REPAIR PLAN ==========');
    console.log('From procurement line costs → BPR header:', fromProc.newHeaderTotalKgs);
    console.log('From stored FIFO snapshots → BPR header:', fromFifo.newHeaderTotalKgs);
    console.log('Procurement SUM:', fromProc.procurementSumKgs);
    console.log('Unmatched BPR lines:', fromProc.unmatchedBprItemIds.length);
    console.log('Procurement-source patches:', fromProc.linePatches.length);

    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to persist BPR derived totals from procurement lines.');
      return;
    }

    const plan = fromProc.unmatchedBprItemIds.length === 0 ? fromProc : fromFifo;
    const linePatches =
      'linePatches' in plan
        ? plan.linePatches.map((patch) => ({
            itemId: patch.itemId,
            quantity: patch.quantity,
            newLineKgs: patch.newLineKgs,
          }))
        : [];
    await prisma.$transaction(async (tx) => {
      for (const patch of linePatches) {
        const unit = deriveDisplayUnitCost(patch.newLineKgs, patch.quantity);
        await tx.branchPurchaseRequestItem.update({
          where: { id: patch.itemId },
          data: {
            estimatedLineProductCostKgs: patch.newLineKgs,
            estimatedUnitCost: unit,
            totalAmount: patch.newLineKgs,
            approvedLineTotalKgs: patch.newLineKgs,
          },
        });
      }
      await tx.branchPurchaseRequest.update({
        where: { id: bpr.id },
        data: { totalEstimatedAmount: plan.newHeaderTotalKgs },
      });
      if (bpr.convertedOrderId) {
        const orderItems = await tx.branchDistributionOrderItem.findMany({
          where: { orderId: bpr.convertedOrderId },
        });
        for (const orderItem of orderItems) {
          const bprItem = bpr.items.find((row) => row.productId === orderItem.productId);
          if (!bprItem) continue;
          const patch = linePatches.find((row) => row.itemId === bprItem.id);
          const lineTotal = patch?.newLineKgs ?? money(bprItem.estimatedLineProductCostKgs);
          const qty = bprItem.approvedQuantity ?? bprItem.quantity;
          const unit = deriveDisplayUnitCost(lineTotal, qty);
          await tx.branchDistributionOrderItem.update({
            where: { id: orderItem.id },
            data: {
              unitPrice: unit,
              totalPrice: lineTotal,
              unitCost: unit,
              totalCost: lineTotal,
              profit: 0,
            },
          });
        }
        await tx.branchDistributionOrder.update({
          where: { id: bpr.convertedOrderId },
          data: {
            totalAmount: plan.newHeaderTotalKgs,
            totalCost: plan.newHeaderTotalKgs,
            totalProfit: 0,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: 'system-repair',
          role: 'SYSTEM',
          action: 'HQ_BRANCH_TRANSFER_COST_REPAIRED',
          entity: 'BranchPurchaseRequest',
          entityId: bpr.id,
          metadata: {
            requestNumber: bpr.requestNumber,
            procurementNumber: PROC_NUMBER,
            oldTotal: plan.oldHeaderTotalKgs,
            newTotal: plan.newHeaderTotalKgs,
            source:
              fromProc.unmatchedBprItemIds.length === 0
                ? 'procurement_item_totalCostKgs'
                : 'stored_fifo_snapshot',
            timestamp: new Date().toISOString(),
          },
        },
      });
    });
    console.log('APPLIED. New BPR total:', plan.newHeaderTotalKgs);
    console.log('Difference vs PROC:', roundDisplayMoney(plan.newHeaderTotalKgs - procTotal));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
