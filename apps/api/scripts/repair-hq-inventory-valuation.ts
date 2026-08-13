/**
 * Idempotent repair: realign HQ warehouse inventory balance valuation with
 * authoritative movement line totals and eliminate ghost value on zero-quantity rows.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-hq-inventory-valuation.ts [--warehouse-id=...]
 *   node --import tsx scripts/repair-hq-inventory-valuation.ts --apply
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import {
  compareWarehouseInventoryValuation,
  sumWarehouseFifoRemainingValueKgs,
} from '../src/inventory/inventory-authoritative-value.util';
import { recomputeInventoryBalanceValuationInTx } from '../src/inventory/inventory-balance-valuation.repair';
import { roundDisplayMoney } from '../src/pricing/product-cost-precision.util';
import { inventoryBranchIdForWarehouse } from '../src/warehouse/warehouse.util';

type Args = { warehouseId?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const warehouseArg = argv.find((a) => a.startsWith('--warehouse-id='));
  return {
    warehouseId: warehouseArg ? warehouseArg.slice('--warehouse-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const warehouses = await prisma.warehouse.findMany({
    where: {
      deletedAt: null,
      warehouseType: WarehouseType.HQ,
      branchId: null,
      ...(args.warehouseId ? { id: args.warehouseId } : {}),
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  const repairs: Array<Record<string, unknown>> = [];
  const warehouseSummaries: Array<Record<string, unknown>> = [];

  for (const warehouse of warehouses) {
    const beforeValuation = await compareWarehouseInventoryValuation(prisma, warehouse.id);
    const fifoTotal = await sumWarehouseFifoRemainingValueKgs(prisma, warehouse.id);

    const ghostBalances = await prisma.inventoryBalance.findMany({
      where: {
        warehouseId: warehouse.id,
        quantity: 0,
        totalValueKgs: { gt: 0 },
      },
      include: { product: { select: { sku: true } } },
    });

    const balances = await prisma.inventoryBalance.findMany({
      where: { warehouseId: warehouse.id },
      include: { product: { select: { id: true, sku: true, branchId: true } } },
    });

    for (const balance of balances) {
      const oldTotal = roundDisplayMoney(n(balance.totalValueKgs));
      const oldAverage = roundDisplayMoney(n(balance.averageCostKgs));
      const branchId = inventoryBranchIdForWarehouse(
        { warehouseType: WarehouseType.HQ, branchId: null },
        balance.product.branchId,
      );

      let nextTotal = oldTotal;
      let nextAverage = oldAverage;
      let nextLanded = roundDisplayMoney(n(balance.landedCostKgs));

      if (args.apply) {
        const valuation = await prisma.$transaction((tx) =>
          recomputeInventoryBalanceValuationInTx(tx, {
            branchId,
            warehouseId: warehouse.id,
            productId: balance.productId,
          }),
        );
        if (valuation) {
          nextTotal = valuation.totalValueKgs;
          nextAverage = valuation.averageCostKgs;
          nextLanded = valuation.landedCostKgs;
        }
      } else {
        const { clampValuationForZeroQuantity, recomputeInventoryBalanceValuation } = await import(
          '../src/inventory/inventory-balance-valuation.util'
        );
        const movements = await prisma.stockMovement.findMany({
          where: {
            branchId,
            warehouseId: warehouse.id,
            productId: balance.productId,
            status: 'ACTIVE',
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            quantity: true,
            unitCostKgs: true,
            totalCostKgs: true,
            createdAt: true,
          },
        });
        const valuation = clampValuationForZeroQuantity(
          balance.quantity,
          recomputeInventoryBalanceValuation(movements),
        );
        nextTotal = valuation.totalValueKgs;
        nextAverage = valuation.averageCostKgs;
        nextLanded = valuation.landedCostKgs;
      }

      const totalDiff = roundDisplayMoney(nextTotal - oldTotal);
      const averageDiff = roundDisplayMoney(nextAverage - oldAverage);
      if (Math.abs(totalDiff) > 0.001 || Math.abs(averageDiff) > 0.001) {
        repairs.push({
          recordType: 'inventory_balance',
          recordId: balance.id,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          productId: balance.productId,
          sku: balance.product.sku,
          quantity: balance.quantity,
          oldValue: {
            totalValueKgs: oldTotal,
            averageCostKgs: oldAverage,
            landedCostKgs: roundDisplayMoney(n(balance.landedCostKgs)),
          },
          correctValue: {
            totalValueKgs: nextTotal,
            averageCostKgs: nextAverage,
            landedCostKgs: nextLanded,
          },
          difference: totalDiff,
          repairReason:
            balance.quantity === 0 && oldTotal > 0
              ? 'zero_quantity_ghost_value_clamp'
              : 'movement_line_total_recompute',
        });
      }
    }

    const afterValuation = args.apply
      ? await compareWarehouseInventoryValuation(prisma, warehouse.id)
      : beforeValuation;

    warehouseSummaries.push({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      fifoTotalKgs: fifoTotal,
      balanceOnHandBeforeKgs: beforeValuation.balanceTotalKgs,
      balanceOnHandAfterKgs: afterValuation.balanceTotalKgs,
      valuationMismatchBeforeKgs: beforeValuation.differenceKgs,
      valuationMismatchAfterKgs: afterValuation.differenceKgs,
      ghostBalanceRows: ghostBalances.map((row) => ({
        balanceId: row.id,
        productId: row.productId,
        sku: row.product.sku,
        ghostValueKgs: roundDisplayMoney(n(row.totalValueKgs)),
      })),
      ghostValueTotalKgs: roundDisplayMoney(
        ghostBalances.reduce((sum, row) => sum + n(row.totalValueKgs), 0),
      ),
    });
  }

  const totalGhostValue = roundDisplayMoney(
    warehouseSummaries.reduce((sum, row) => sum + n(row.ghostValueTotalKgs), 0),
  );

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        filters: { warehouseId: args.warehouseId ?? null },
        warehouseSummaries,
        repairSummary: {
          balanceRowsToRepair: repairs.length,
          totalBalanceValueDeltaKgs: roundDisplayMoney(
            repairs.reduce((sum, row) => sum + n(row.difference), 0),
          ),
          ghostValueOnZeroQtyRowsKgs: totalGhostValue,
        },
        repairs: repairs.slice(0, 500),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
