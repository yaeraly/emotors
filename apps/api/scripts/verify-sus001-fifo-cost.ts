/**
 * End-to-end verification for SUS001 FIFO cost vs InventoryBalance average 407.53.
 * Requires seed-sus001-repro.ts to have run.
 */
import { PrismaClient, BranchType } from '@prisma/client';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import { buildFifoAllocationLines } from '../src/pricing/pricing-fifo-allocation.util';

const p = new PrismaClient();

async function main() {
  const inv = await p.product.findFirst({
    where: {
      sku: 'SUS001',
      deletedAt: null,
      fifoBatches: { some: {} },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!inv) throw new Error('SUS001 not found — run seed-sus001-repro.ts first');

  const bal = await p.inventoryBalance.findFirst({
    where: { productId: inv.id, warehouse: { warehouseType: 'HQ' } },
  });
  const batches = await p.fifoInventoryBatch.findMany({
    where: { productId: inv.id },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  const moves = await p.stockMovement.findMany({
    where: { productId: inv.id, type: 'IN' },
    orderBy: { createdAt: 'asc' },
  });

  const svc = new PricingFifoService(p as any);
  const costInv = await svc.getLatestHqCostPrice(inv.id);

  // Catalog twin with same SKU on another branch (product-id drift)
  let siblingBranch = await p.branch.findFirst({ where: { code: 'SUS001-CAT-BR' } });
  if (!siblingBranch) {
    siblingBranch = await p.branch.create({
      data: {
        code: 'SUS001-CAT-BR',
        name: 'Catalog Twin Branch',
        branchType: BranchType.HQ_BRANCH,
        ownerName: 'HQ',
        city: 'Bishkek',
      },
    });
  }
  let sibling = await p.product.findFirst({
    where: { branchId: siblingBranch.id, sku: 'SUS001', deletedAt: null },
  });
  if (!sibling) {
    const whId = bal?.warehouseId ?? inv.warehouseId;
    if (!whId || !inv.categoryId) throw new Error('No warehouse/category for twin product');
    sibling = await p.product.create({
      data: {
        branchId: siblingBranch.id,
        warehouseId: whId,
        categoryId: inv.categoryId,
        name: inv.name,
        sku: 'SUS001',
        category: inv.category,
        unit: inv.unit,
        finalCostKgs: 407.53,
        costPriceKgs: 407.53,
        purchaseCostKgs: 0,
        transportCostKgs: 0,
        sellingPriceKgs: 600,
        isActive: true,
      } as any,
    });
  }
  if (bal) {
    const existingBal = await p.inventoryBalance.findFirst({
      where: { productId: sibling.id, warehouseId: bal.warehouseId },
    });
    if (!existingBal) {
      await p.inventoryBalance.create({
        data: {
          branchId: sibling.branchId,
          warehouseId: bal.warehouseId,
          productId: sibling.id,
          quantity: Number(bal.quantity),
          averageCostKgs: Number(bal.averageCostKgs),
          landedCostKgs: 0,
          totalValueKgs: Number(bal.totalValueKgs),
        },
      });
    }
  }

  const costCatalogTwin = await svc.getLatestHqCostPrice(sibling.id);

  const layer1 = batches[0];
  const layer2 = batches[1];
  if (layer1) {
    await p.fifoInventoryBatch.update({
      where: { id: layer1.id },
      data: { remainingQuantity: 0 },
    });
  }
  const costAfterDeplete = await svc.getLatestHqCostPrice(inv.id);
  if (layer1) {
    await p.fifoInventoryBatch.update({
      where: { id: layer1.id },
      data: { remainingQuantity: layer1.remainingQuantity },
    });
  }

  const restored = await p.fifoInventoryBatch.findMany({
    where: { productId: inv.id },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  const alloc = buildFifoAllocationLines(
    restored.map((b) => ({
      batchId: b.id,
      remainingQuantity: b.remainingQuantity,
      unitCostKgs: Number(b.unitCostKgs),
    })),
    100,
    { markupPercent: 20, branchType: 'FRANCHISE' },
  );

  const avg = bal ? Number(bal.averageCostKgs) : null;

  console.log(
    JSON.stringify(
      {
        originOf40753: {
          table: 'InventoryBalance',
          field: 'averageCostKgs',
          also: 'totalValueKgs / quantity',
          value: avg,
          formula: '(Σ shipmentQty × shipmentUnitLandedCost) / Σ shipmentQty',
          incorrectServiceMethod:
            'PricingFifoService.getLatestHqCostPrice → HQ_INVENTORY_BALANCE (removed in d6fe0d2)',
          incorrectFormula: 'InventoryBalance.totalValueKgs / InventoryBalance.quantity',
        },
        purchases: moves.map((m, i) => ({
          shipment: i + 1,
          movementId: m.id,
          receivedQty: Math.abs(m.quantity),
          totalLandedCostKgs: Number(m.totalCostKgs),
          unitLandedCostKgs: Number(m.unitCostKgs),
        })),
        fifoLayers: restored.map((b) => ({
          batchId: b.id,
          receivedAt: b.receivedAt,
          initialQuantity: b.initialQuantity,
          remainingQuantity: b.remainingQuantity,
          unitCostKgs: Number(b.unitCostKgs),
        })),
        activeBeforeDeplete: costInv,
        viaSameSkuCatalogTwin: costCatalogTwin,
        afterLayer1Depleted: costAfterDeplete,
        branchOrder100units: {
          lines: alloc.lines.map((l) => ({
            batchId: l.batchId,
            qty: l.quantity,
            unitCostKgs: l.unitCostKgs,
            unitPriceKgs: l.unitPriceKgs,
            markupPercent: l.markupPercent,
            profitKgs: l.profitKgs,
            totalCostKgs: l.totalCostKgs,
            totalPriceKgs: l.totalPriceKgs,
          })),
          totalCostKgs: alloc.totalCostKgs,
          totalPriceKgs: alloc.totalPriceKgs,
          profitKgs: alloc.profitKgs,
        },
        assertions: {
          avgIs40753: avg === 407.53,
          activeIsNot40753: costInv.costPriceKgs !== 407.53,
          activeIsLayer1: costInv.costPriceKgs === Number(layer1?.unitCostKgs ?? -1),
          skuTwinResolvesFifo: costCatalogTwin.costPriceKgs === Number(layer1?.unitCostKgs ?? -1),
          depleteSwitchesToLayer2:
            costAfterDeplete.costPriceKgs === Number(layer2?.unitCostKgs ?? -1),
          multiLayerSplit:
            alloc.lines.length === 2 &&
            alloc.lines[0]?.quantity === 80 &&
            alloc.lines[1]?.quantity === 20,
        },
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
