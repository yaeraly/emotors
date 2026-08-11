import { BranchPurchaseRequestStatus } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  resolveBranchPurchaseDraftLineTotalKgs,
  sumBranchPurchaseDraftLineTotalsKgs,
} from './branch-purchase-branch-display.util';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  sumBranchPurchaseHqReviewLineAmountsKgs,
} from './branch-purchase-review-totals.util';
import {
  sanitizeBranchPurchaseRequest,
  toBranchPurchaseRequestResponse,
} from './branch-purchase-request.presenter';

type PrismaTx = {
  branch: {
    findFirst: (args: unknown) => Promise<{ branchType: string | null } | null>;
  };
  branchPurchaseRequest: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  branchPurchaseRequestItem: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const REVIEWED_STATUSES = new Set<BranchPurchaseRequestStatus>([
  BranchPurchaseRequestStatus.APPROVED,
  BranchPurchaseRequestStatus.PARTIALLY_APPROVED,
  BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
  BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
  BranchPurchaseRequestStatus.BRANCH_DECLINED,
  BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
  BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
  BranchPurchaseRequestStatus.SHIPPED,
  BranchPurchaseRequestStatus.RECEIVED,
  BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE,
  BranchPurchaseRequestStatus.COMPLETED,
  BranchPurchaseRequestStatus.PAYMENT_CONFIRMED,
  BranchPurchaseRequestStatus.PAYMENT_SUBMITTED,
  BranchPurchaseRequestStatus.PENDING_PAYMENT,
  BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
]);

/** Recompute and persist authoritative line/order totals from frozen order-line snapshots. */
export async function repairBranchPurchaseRequestDerivedTotalsInTx(
  tx: PrismaTx,
  requestId: string,
): Promise<{
  requestId: string;
  previousOrderTotalKgs: number;
  repairedOrderTotalKgs: number;
  lineRepairs: Array<{ itemId: string; previousKgs: number; repairedKgs: number }>;
}> {
  const request = await tx.branchPurchaseRequest.findUnique({
    where: { id: requestId },
    include: {
      branch: { select: { branchType: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });

  if (!request) {
    throw new Error(`Branch purchase request not found: ${requestId}`);
  }

  const branchType = (request.branch as { branchType?: string | null } | null)?.branchType ?? null;
  const items = request.items as Array<Record<string, unknown>>;
  const previousOrderTotalKgs = roundDisplayMoney(Number(request.totalEstimatedAmount ?? 0));
  const isDraft = request.status === BranchPurchaseRequestStatus.DRAFT;

  const lineRepairs: Array<{ itemId: string; previousKgs: number; repairedKgs: number }> = [];
  const repairedLineAmounts = new Map<string, number>();

  for (const row of items) {
    const lineInput = {
      quantity: Number(row.quantity ?? 0),
      approvedQuantity: row.approvedQuantity as number | null | undefined,
      lineStatus: row.lineStatus as string | null | undefined,
      totalAmount: row.totalAmount,
      approvedLineTotalKgs: row.approvedLineTotalKgs,
      resolvedBranchPriceKgs: row.resolvedBranchPriceKgs,
      branchPurchasePriceKgs: row.branchPurchasePriceKgs,
      estimatedLineProductCostKgs: row.estimatedLineProductCostKgs,
      hasPricingPolicyAtReview:
        (row.hasPricingPolicyAtReview as boolean | null | undefined) ??
        (row.hasPricingPolicyAtSubmit as boolean | null | undefined),
      branchType,
      hasPricingPolicy:
        (row.hasPricingPolicyAtReview as boolean | null | undefined) ??
        (row.hasPricingPolicyAtSubmit as boolean | null | undefined),
    };
    const repairedKgs = isDraft
      ? resolveBranchPurchaseDraftLineTotalKgs(lineInput)
      : computeBranchPurchaseHqReviewLineAmountKgs(lineInput);
    const previousKgs = roundDisplayMoney(Number(row.totalAmount ?? 0));
    const reviewed =
      row.lineStatus != null && row.lineStatus !== 'PENDING_REVIEW';

    if (previousKgs !== repairedKgs) {
      lineRepairs.push({ itemId: String(row.id), previousKgs, repairedKgs });
    }

    await tx.branchPurchaseRequestItem.update({
      where: { id: row.id },
      data: {
        totalAmount: repairedKgs,
        approvedLineTotalKgs: reviewed && repairedKgs > 0 ? repairedKgs : null,
      },
    });
    repairedLineAmounts.set(String(row.id), repairedKgs);
  }

  const repairedOrderTotalKgs = isDraft
    ? sumBranchPurchaseDraftLineTotalsKgs(
        items.map((row) => ({
          quantity: Number(row.quantity ?? 0),
          branchPurchasePriceKgs: row.branchPurchasePriceKgs,
          resolvedBranchPriceKgs: row.resolvedBranchPriceKgs,
          totalAmount: repairedLineAmounts.get(String(row.id)) ?? row.totalAmount,
          estimatedLineProductCostKgs: row.estimatedLineProductCostKgs,
          branchType,
          hasPricingPolicy:
            (row.hasPricingPolicyAtReview as boolean | null | undefined) ??
            (row.hasPricingPolicyAtSubmit as boolean | null | undefined),
        })),
      )
    : sumBranchPurchaseHqReviewLineAmountsKgs(
        items.map((row) => ({
          quantity: Number(row.quantity ?? 0),
          approvedQuantity: row.approvedQuantity as number | null | undefined,
          lineStatus: row.lineStatus as string | null | undefined,
          totalAmount: repairedLineAmounts.get(String(row.id)) ?? row.totalAmount,
          approvedLineTotalKgs: repairedLineAmounts.get(String(row.id)) ?? row.approvedLineTotalKgs,
          resolvedBranchPriceKgs: row.resolvedBranchPriceKgs,
          estimatedLineProductCostKgs: row.estimatedLineProductCostKgs,
          hasPricingPolicyAtReview:
            (row.hasPricingPolicyAtReview as boolean | null | undefined) ??
            (row.hasPricingPolicyAtSubmit as boolean | null | undefined),
          branchType,
        })),
      );

  await tx.branchPurchaseRequest.update({
    where: { id: requestId },
    data: { totalEstimatedAmount: repairedOrderTotalKgs },
  });

  return {
    requestId,
    previousOrderTotalKgs,
    repairedOrderTotalKgs,
    lineRepairs,
  };
}

export function assertBranchPurchaseRequestTotalParity(
  request: Record<string, unknown> & {
    status: BranchPurchaseRequestStatus;
    reviewedAt?: Date | string | null;
    items: Array<Record<string, unknown>>;
    branch?: { branchType?: string | null } | null;
  },
): { hqSalesTotalKgs: number; branchManagerTotalKgs: number; lineSumKgs: number } {
  const full = toBranchPurchaseRequestResponse(request as Parameters<typeof toBranchPurchaseRequestResponse>[0]);
  const sanitized = sanitizeBranchPurchaseRequest(
    request as Parameters<typeof sanitizeBranchPurchaseRequest>[0],
    true,
  );
  const hqSalesTotalKgs = roundDisplayMoney(Number(full.totalEstimatedAmount ?? 0));
  const branchManagerTotalKgs = roundDisplayMoney(Number(sanitized.totalEstimatedAmount ?? 0));
  const lineSumKgs = roundDisplayMoney(
    sanitized.items.reduce(
      (sum, item) => sum + Number((item as { totalAmount?: number }).totalAmount ?? 0),
      0,
    ),
  );
  return { hqSalesTotalKgs, branchManagerTotalKgs, lineSumKgs };
}

export function isRepairableBranchPurchaseRequestStatus(status: BranchPurchaseRequestStatus): boolean {
  return status === BranchPurchaseRequestStatus.DRAFT || REVIEWED_STATUSES.has(status);
}
