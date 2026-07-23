import type { PrismaClient, Prisma } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Reconstruct FIFO remaining from auditable consumption only (sales + consumed distributions).
 * Does not guess — returns received minus recorded allocations.
 */
export async function computeFifoRemainingFromMovement(
  client: DbClient,
  movementId: string,
  receivedQuantity: number,
) {
  const saleConsumed = await client.saleFifoAllocation.aggregate({
    where: { fifoBatch: { stockMovementId: movementId } },
    _sum: { quantity: true },
  });
  const distributionConsumed = await client.distributionFifoAllocation.aggregate({
    where: {
      fifoBatch: { stockMovementId: movementId },
      status: 'CONSUMED',
    },
    _sum: { quantity: true },
  });
  const consumed =
    Number(saleConsumed._sum.quantity ?? 0) + Number(distributionConsumed._sum.quantity ?? 0);
  return Math.max(receivedQuantity - consumed, 0);
}

export async function computeFifoReservedOnBatch(client: DbClient, fifoBatchId: string) {
  const reserved = await client.distributionFifoAllocation.aggregate({
    where: { fifoBatchId, status: 'RESERVED' },
    _sum: { quantity: true },
  });
  return Number(reserved._sum.quantity ?? 0);
}
