import { Prisma } from '@prisma/client';

export const branchPurchaseRequestItemsOrderBy = {
  position: 'asc',
} as const satisfies Prisma.BranchPurchaseRequestItemOrderByWithRelationInput;

export const branchPurchaseRequestItemsInclude = {
  orderBy: branchPurchaseRequestItemsOrderBy,
} as const;

export function sortBranchPurchaseRequestItems<
  T extends { position?: number | null; createdAt?: Date | string | null; id?: string | null },
>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftPosition = Number(left.position ?? 0);
    const rightPosition = Number(right.position ?? 0);
    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}
