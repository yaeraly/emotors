import { BadRequestException } from '@nestjs/common';
import { Prisma, StockMovementStatus, StockMovementType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export const INVENTORY_CHRONOLOGY_ERROR_RU =
  'Невозможно изменить дату: на выбранную дату на складе недостаточно доступного остатка.';

type ChronologyEvent = {
  id: string;
  at: Date;
  delta: number;
  mutable: boolean;
};

function movementDelta(type: StockMovementType, quantity: number): number {
  const qty = Math.abs(Number(quantity));
  switch (type) {
    case StockMovementType.IN:
    case StockMovementType.INVENTORY_ADJUSTMENT_IN:
      return qty;
    case StockMovementType.OUT:
    case StockMovementType.SALE:
    case StockMovementType.SERVICE_USE:
    case StockMovementType.INVENTORY_ADJUSTMENT_OUT:
      return -qty;
    default:
      return Number(quantity);
  }
}

/**
 * Validates that changing a FIFO batch receivedAt keeps non-negative running stock.
 */
export async function assertFifoBatchDateChangeValid(
  prisma: PrismaService,
  batchId: string,
  newReceivedAt: Date,
) {
  const batch = await prisma.fifoInventoryBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      receivedAt: true,
      initialQuantity: true,
      stockMovementId: true,
    },
  });
  if (!batch) return;

  const batches = await prisma.fifoInventoryBatch.findMany({
    where: { productId: batch.productId, warehouseId: batch.warehouseId },
    select: {
      id: true,
      receivedAt: true,
      initialQuantity: true,
      stockMovementId: true,
    },
  });

  const outboundMovements = await prisma.stockMovement.findMany({
    where: {
      productId: batch.productId,
      warehouseId: batch.warehouseId,
      status: StockMovementStatus.ACTIVE,
      type: {
        in: [
          StockMovementType.OUT,
          StockMovementType.SALE,
          StockMovementType.SERVICE_USE,
          StockMovementType.INVENTORY_ADJUSTMENT_OUT,
        ],
      },
    },
    select: { id: true, type: true, quantity: true, createdAt: true },
  });

  const events: ChronologyEvent[] = [];

  for (const row of batches) {
    const at = row.id === batchId ? newReceivedAt : row.receivedAt;
    events.push({
      id: `batch:${row.id}`,
      at,
      delta: row.initialQuantity,
      mutable: row.id === batchId,
    });
  }

  for (const movement of outboundMovements) {
    events.push({
      id: `movement:${movement.id}`,
      at: movement.createdAt,
      delta: movementDelta(movement.type, movement.quantity),
      mutable: false,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));

  let running = 0;
  for (const event of events) {
    running += event.delta;
    if (running < 0) {
      throw new BadRequestException({
        message: INVENTORY_CHRONOLOGY_ERROR_RU,
        code: 'INVENTORY_CHRONOLOGY_INVALID',
      });
    }
  }
}

export async function assertProcurementReceivingDateChangeValid(
  prisma: PrismaService,
  receivingId: string,
  newReceivedAt: Date,
) {
  const receiving = await prisma.procurementGoodsReceiving.findUnique({
    where: { id: receivingId },
    select: { receivedAt: true, procurementOrderId: true },
  });
  if (!receiving) return;

  const items = await prisma.procurementGoodsReceivingItem.findMany({
    where: { receivingId },
    select: { productId: true, receivedQuantity: true },
  });

  for (const item of items) {
    if (!item.productId || item.receivedQuantity <= 0) continue;
    const order = await prisma.procurementOrder.findUnique({
      where: { id: receiving.procurementOrderId },
      select: { hqWarehouseId: true },
    });
    if (!order?.hqWarehouseId) continue;

    const batch = await prisma.fifoInventoryBatch.findFirst({
      where: {
        productId: item.productId,
        warehouseId: order.hqWarehouseId,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        referenceId: receivingId,
      },
      select: { id: true },
    });
    if (batch) {
      await assertFifoBatchDateChangeValid(prisma, batch.id, newReceivedAt);
    }
  }
}
