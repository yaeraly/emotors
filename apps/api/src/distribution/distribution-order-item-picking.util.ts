import { BadRequestException } from '@nestjs/common';
import { BranchDistributionOrderStatus } from '@prisma/client';

export type DistributionPickingProgress = {
  pickedCount: number;
  totalCount: number;
  remainingCount: number;
};

export type DistributionOrderItemPickingRow = {
  quantity: number;
  pickedAt?: Date | string | null;
};

const ITEM_PICKING_ALLOWED_STATUSES = new Set<BranchDistributionOrderStatus>([
  BranchDistributionOrderStatus.PICKING,
]);

export function isDistributionItemEligibleForPicking(item: { quantity: number }) {
  return Number(item.quantity) > 0;
}

export function buildDistributionPickingProgress(
  items: DistributionOrderItemPickingRow[] | null | undefined,
): DistributionPickingProgress {
  const required = (items ?? []).filter(isDistributionItemEligibleForPicking);
  const pickedCount = required.filter((item) => item.pickedAt != null).length;
  const totalCount = required.length;

  return {
    pickedCount,
    totalCount,
    remainingCount: Math.max(totalCount - pickedCount, 0),
  };
}

export function assertDistributionOrderItemPickingAllowed(status: BranchDistributionOrderStatus) {
  if (!ITEM_PICKING_ALLOWED_STATUSES.has(status)) {
    throw new BadRequestException('Изменять отметки сборки можно только на этапе «Сборка»');
  }
}

export function assertAllDistributionItemsPicked(
  items: DistributionOrderItemPickingRow[] | null | undefined,
) {
  const progress = buildDistributionPickingProgress(items);
  if (progress.totalCount === 0 || progress.remainingCount === 0) {
    return progress;
  }

  throw new BadRequestException(
    `Нельзя упаковать заказ: не все товары собраны. Собрано: ${progress.pickedCount} из ${progress.totalCount} позиций. Осталось: ${progress.remainingCount}.`,
  );
}

export function isDistributionOrderItemPicked(item: { pickedAt?: Date | string | null }) {
  return item.pickedAt != null;
}
