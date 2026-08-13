import {
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
} from '@prisma/client';
import { shouldRepairBprStatusForRejectedInstallment } from './branch-purchase-payment-status-sync.util';

const TERMINAL_BPR_STATUSES = new Set<BranchPurchaseRequestStatus>([
  BranchPurchaseRequestStatus.REJECTED,
  BranchPurchaseRequestStatus.CANCELLED,
  BranchPurchaseRequestStatus.COMPLETED,
]);

export type BprInstallmentRejectionRepairResult = {
  bprId: string;
  requestNumber: string;
  oldStatus: BranchPurchaseRequestStatus;
  newStatus: BranchPurchaseRequestStatus;
  installmentId: string | null;
  repaired: boolean;
};

type PrismaTx = {
  branchPurchaseRequest: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  branchDistributionOrder: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  branchInvoice: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  auditLog: {
    create: (args: unknown) => Promise<unknown>;
  };
};

export async function findStaleBprInstallmentRejections(
  prisma: {
    branchPurchaseRequest: {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    };
    branchDistributionOrder: {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    };
    branchInvoice: {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    };
  },
  filter?: { requestNumbers?: string[]; requestIds?: string[] },
): Promise<
  Array<{
    bprId: string;
    requestNumber: string;
    bprStatus: BranchPurchaseRequestStatus;
    installmentId: string | null;
    installmentStatus: BranchOrderInstallmentStatus | null;
  }>
> {
  const where: Record<string, unknown> = { deletedAt: null, convertedOrderId: { not: null } };
  if (filter?.requestIds?.length) {
    where.id = { in: filter.requestIds };
  } else if (filter?.requestNumbers?.length) {
    where.requestNumber = { in: filter.requestNumbers };
  }

  const requests = await prisma.branchPurchaseRequest.findMany({
    where,
    select: { id: true, requestNumber: true, status: true, convertedOrderId: true },
  });

  const orderIds = requests
    .map((row) => row.convertedOrderId as string | null)
    .filter(Boolean) as string[];
  if (!orderIds.length) return [];

  const orders = await prisma.branchDistributionOrder.findMany({
    where: { id: { in: orderIds }, deletedAt: null },
    select: { id: true },
  });
  const orderIdSet = new Set(orders.map((row) => String(row.id)));

  const invoices = await prisma.branchInvoice.findMany({
    where: {
      distributionOrderId: { in: orderIds },
      deletedAt: null,
      OR: [{ invoiceCategory: null }, { invoiceCategory: 'PRODUCT_ORDER' }],
    },
    select: {
      distributionOrderId: true,
      branchOrderInstallment: { select: { id: true, status: true } },
    },
  });

  const installmentByOrderId = new Map<
    string,
    { id: string; status: BranchOrderInstallmentStatus }
  >();
  for (const invoice of invoices) {
    const installment = invoice.branchOrderInstallment as
      | { id: string; status: BranchOrderInstallmentStatus }
      | null
      | undefined;
    if (!installment || !invoice.distributionOrderId) continue;
    installmentByOrderId.set(String(invoice.distributionOrderId), installment);
  }

  const stale: Array<{
    bprId: string;
    requestNumber: string;
    bprStatus: BranchPurchaseRequestStatus;
    installmentId: string | null;
    installmentStatus: BranchOrderInstallmentStatus | null;
  }> = [];

  for (const request of requests) {
    const orderId = String(request.convertedOrderId ?? '');
    if (!orderIdSet.has(orderId)) continue;
    const installment = installmentByOrderId.get(orderId) ?? null;
    const bprStatus = request.status as BranchPurchaseRequestStatus;
    if (
      !shouldRepairBprStatusForRejectedInstallment({
        bprStatus,
        installmentStatus: installment?.status ?? null,
      })
    ) {
      continue;
    }
    stale.push({
      bprId: String(request.id),
      requestNumber: String(request.requestNumber),
      bprStatus,
      installmentId: installment?.id ?? null,
      installmentStatus: installment?.status ?? null,
    });
  }

  return stale;
}

export async function repairBprInstallmentRejectionStatusInTx(
  tx: PrismaTx,
  input: {
    bprId: string;
    requestNumber: string;
    oldStatus: BranchPurchaseRequestStatus;
    installmentId?: string | null;
    decisionBy?: string;
    trigger?: string;
  },
): Promise<BprInstallmentRejectionRepairResult> {
  await tx.branchPurchaseRequest.update({
    where: { id: input.bprId },
    data: { status: BranchPurchaseRequestStatus.REJECTED },
  });

  const timestamp = new Date().toISOString();
  const metadata = {
    bprId: input.bprId,
    installmentId: input.installmentId ?? null,
    oldStatus: input.oldStatus,
    newStatus: BranchPurchaseRequestStatus.REJECTED,
    decisionBy: input.decisionBy ?? 'system-repair',
    timestamp,
    trigger: input.trigger ?? 'INSTALLMENT_REJECTED_REPAIR',
    requestNumber: input.requestNumber,
  };

  await tx.auditLog.create({
    data: {
      userId: input.decisionBy ?? 'system-repair',
      role: 'SYSTEM',
      action: 'HQ_CEO_BPR_REJECTED',
      entity: 'BranchPurchaseRequest',
      entityId: input.bprId,
      metadata,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: input.decisionBy ?? 'system-repair',
      role: 'SYSTEM',
      action: 'BPR_STATUS_CHANGED',
      entity: 'BranchPurchaseRequest',
      entityId: input.bprId,
      metadata,
    },
  });

  return {
    bprId: input.bprId,
    requestNumber: input.requestNumber,
    oldStatus: input.oldStatus,
    newStatus: BranchPurchaseRequestStatus.REJECTED,
    installmentId: input.installmentId ?? null,
    repaired: true,
  };
}

export async function repairAllStaleBprInstallmentRejectionsInTx(
  tx: PrismaTx,
  staleRows: Array<{
    bprId: string;
    requestNumber: string;
    bprStatus: BranchPurchaseRequestStatus;
    installmentId: string | null;
  }>,
): Promise<BprInstallmentRejectionRepairResult[]> {
  const results: BprInstallmentRejectionRepairResult[] = [];
  for (const row of staleRows) {
    results.push(
      await repairBprInstallmentRejectionStatusInTx(tx, {
        bprId: row.bprId,
        requestNumber: row.requestNumber,
        oldStatus: row.bprStatus,
        installmentId: row.installmentId,
      }),
    );
  }
  return results;
}

export function isTerminalBprStatusForInstallmentRejection(
  status: BranchPurchaseRequestStatus | string,
): boolean {
  return TERMINAL_BPR_STATUSES.has(status as BranchPurchaseRequestStatus);
}
