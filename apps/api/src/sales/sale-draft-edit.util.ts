import { BadRequestException } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { isBranchSalesManagerUser } from '../rbac/rbac';

export const SALE_DRAFT_EDIT_BLOCKED_MESSAGE =
  'Продажу нельзя изменить, потому что она уже вышла из статуса «Черновик».';

export type DraftSaleItemSnapshot = {
  productId: string | null;
  productSku: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export type DraftSaleSnapshot = {
  customerId: string;
  notes: string | null;
  totalAmount: number;
  pricingPolicyVersionId: string | null;
  items: DraftSaleItemSnapshot[];
};

export function editableDraftStatusesForUser(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
): SaleStatus[] {
  if (isBranchSalesManagerUser(user)) {
    return [SaleStatus.DRAFT];
  }
  return [SaleStatus.DRAFT, SaleStatus.SENT_TO_CUSTOMER];
}

export function assertSaleDraftEditable(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
  sale: { status: SaleStatus },
) {
  const allowed = editableDraftStatusesForUser(user);
  if (allowed.includes(sale.status)) {
    return;
  }
  if (isBranchSalesManagerUser(user)) {
    throw new BadRequestException(SALE_DRAFT_EDIT_BLOCKED_MESSAGE);
  }
  throw new BadRequestException('Cannot edit finalized or approved sale');
}

export function buildDraftSaleSnapshot(input: {
  customerId: string;
  notes: string | null;
  totalAmount: number | { toString(): string };
  pricingPolicyVersionId: string | null;
  items: Array<{
    productId: string | null;
    productSku: string | null;
    productName: string;
    quantity: number;
    unitPrice: number | { toString(): string };
  }>;
}): DraftSaleSnapshot {
  return {
    customerId: input.customerId,
    notes: input.notes,
    totalAmount: Number(input.totalAmount),
    pricingPolicyVersionId: input.pricingPolicyVersionId,
    items: input.items.map((item) => ({
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
  };
}

export function diffDraftSaleItemChanges(
  previousItems: DraftSaleItemSnapshot[],
  nextItems: Array<{
    productId?: string;
    productSku?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>,
) {
  const previousByProduct = new Map(
    previousItems
      .filter((item) => item.productId)
      .map((item) => [item.productId as string, item]),
  );
  const nextByProduct = new Map(
    nextItems.filter((item) => item.productId).map((item) => [item.productId as string, item]),
  );

  const added = [...nextByProduct.entries()]
    .filter(([productId]) => !previousByProduct.has(productId))
    .map(([, item]) => item);

  const removed = [...previousByProduct.entries()]
    .filter(([productId]) => !nextByProduct.has(productId))
    .map(([, item]) => item);

  const priceChanged = [...nextByProduct.entries()]
    .filter(([productId, item]) => {
      const previous = previousByProduct.get(productId);
      return previous && Math.abs(previous.unitPrice - item.unitPrice) > 0.01;
    })
    .map(([productId, item]) => ({
      productId,
      previousPrice: previousByProduct.get(productId)!.unitPrice,
      newPrice: item.unitPrice,
    }));

  return { added, removed, priceChanged };
}
