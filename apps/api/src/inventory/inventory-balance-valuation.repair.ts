import type { Prisma } from '@prisma/client';
import { recomputeInventoryBalanceValuation, clampValuationForZeroQuantity } from './inventory-balance-valuation.util';

type PrismaTx = Prisma.TransactionClient;

export async function recomputeInventoryBalanceValuationInTx(
  tx: PrismaTx,
  input: { branchId: string; warehouseId: string; productId: string },
) {
  const balance = await tx.inventoryBalance.findUnique({
    where: {
      branchId_warehouseId_productId: {
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
    select: { id: true },
  });
  if (!balance) return null;

  const movements = await tx.stockMovement.findMany({
    where: {
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      productId: input.productId,
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

  const balanceRow = await tx.inventoryBalance.findUnique({
    where: { id: balance.id },
    select: { quantity: true },
  });
  const valuation = clampValuationForZeroQuantity(
    balanceRow?.quantity ?? 0,
    recomputeInventoryBalanceValuation(movements),
  );
  await tx.inventoryBalance.update({
    where: { id: balance.id },
    data: {
      totalValueKgs: valuation.totalValueKgs,
      averageCostKgs: valuation.averageCostKgs,
      landedCostKgs: valuation.landedCostKgs,
    },
  });

  return valuation;
}
