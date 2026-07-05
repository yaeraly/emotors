import { Prisma, StockMovementType } from '@prisma/client';

export const HQ_RECEIVING_ARCHIVED_MESSAGE =
  'This goods receipt is already used in other operations and has been archived.';

const OUTBOUND_MOVEMENT_TYPES: StockMovementType[] = [
  StockMovementType.OUT,
  StockMovementType.TRANSFER,
  StockMovementType.SALE,
  StockMovementType.SERVICE_USE,
  StockMovementType.INVENTORY_ADJUSTMENT_OUT,
];

export async function hasHqReceivingDownstreamUsage(
  tx: Prisma.TransactionClient,
  receiving: {
    id: string;
    hqWarehouseId: string;
    receivedAt: Date;
    items: Array<{ productId: string }>;
  },
) {
  const productIds = [...new Set(receiving.items.map((item) => item.productId))];
  if (!productIds.length) return false;

  const inMovements = await tx.stockMovement.findMany({
    where: {
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      referenceId: receiving.id,
      type: StockMovementType.IN,
      status: 'ACTIVE',
    },
    select: { id: true, productId: true, createdAt: true },
  });
  const movementStartedAt = inMovements.length
    ? inMovements.reduce(
        (earliest, movement) => (movement.createdAt < earliest ? movement.createdAt : earliest),
        inMovements[0].createdAt,
      )
    : receiving.receivedAt;

  const distributionUsage = await tx.branchDistributionOrderItem.count({
    where: {
      productId: { in: productIds },
      order: {
        sourceWarehouseId: receiving.hqWarehouseId,
        deletedAt: null,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        createdAt: { gte: movementStartedAt },
      },
    },
  });
  if (distributionUsage > 0) return true;

  const outboundMovements = await tx.stockMovement.count({
    where: {
      warehouseId: receiving.hqWarehouseId,
      productId: { in: productIds },
      createdAt: { gt: movementStartedAt },
      type: { in: OUTBOUND_MOVEMENT_TYPES },
      status: 'ACTIVE',
      NOT: {
        referenceType: 'HQ_RECEIVING_STOCK_ROLLBACK',
        referenceId: receiving.id,
      },
    },
  });
  if (outboundMovements > 0) return true;

  const adjustmentMovements = await tx.stockMovement.count({
    where: {
      warehouseId: receiving.hqWarehouseId,
      productId: { in: productIds },
      createdAt: { gt: movementStartedAt },
      type: {
        in: [
          StockMovementType.ADJUSTMENT,
          StockMovementType.INVENTORY_ADJUSTMENT_IN,
          StockMovementType.INVENTORY_ADJUSTMENT_OUT,
        ],
      },
      status: 'ACTIVE',
    },
  });
  if (adjustmentMovements > 0) return true;

  const salesUsage = await tx.stockMovement.count({
    where: {
      warehouseId: receiving.hqWarehouseId,
      productId: { in: productIds },
      createdAt: { gt: movementStartedAt },
      type: StockMovementType.SALE,
      status: 'ACTIVE',
    },
  });
  return salesUsage > 0;
}
