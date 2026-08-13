import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
} from '@prisma/client';
import { shouldRepairBprStatusForRejectedInstallment } from './branch-purchase-payment-status-sync.util';
import {
  findStaleBprInstallmentRejections,
  repairBprInstallmentRejectionStatusInTx,
} from './branch-purchase-installment-rejection-repair.util';

describe('branch purchase installment rejection repair', () => {
  it('finds stale rows and repairs BPR status to REJECTED with audit trail', async () => {
    const auditCalls: Array<{ action: string; metadata: Record<string, unknown> }> = [];
    const updates: Array<{ id: string; status: BranchPurchaseRequestStatus }> = [];

    const prisma = {
      branchPurchaseRequest: {
        findMany: async () => [
          {
            id: 'bpr-1',
            requestNumber: 'BPR-1786349778733',
            status: BranchPurchaseRequestStatus.PENDING_PAYMENT,
            convertedOrderId: 'order-1',
          },
          {
            id: 'bpr-2',
            requestNumber: 'BPR-1786365940215',
            status: BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
            convertedOrderId: 'order-2',
          },
          {
            id: 'bpr-3',
            requestNumber: 'BPR-OK',
            status: BranchPurchaseRequestStatus.REJECTED,
            convertedOrderId: 'order-3',
          },
        ],
      },
      branchDistributionOrder: {
        findMany: async () => [{ id: 'order-1' }, { id: 'order-2' }, { id: 'order-3' }],
      },
      branchInvoice: {
        findMany: async () => [
          {
            distributionOrderId: 'order-1',
            branchOrderInstallment: {
              id: 'inst-1',
              status: BranchOrderInstallmentStatus.REJECTED,
            },
          },
          {
            distributionOrderId: 'order-2',
            branchOrderInstallment: {
              id: 'inst-2',
              status: BranchOrderInstallmentStatus.REJECTED,
            },
          },
          {
            distributionOrderId: 'order-3',
            branchOrderInstallment: {
              id: 'inst-3',
              status: BranchOrderInstallmentStatus.REJECTED,
            },
          },
        ],
      },
    };

    const stale = await findStaleBprInstallmentRejections(prisma);
    assert.equal(stale.length, 2);
    assert.deepEqual(
      stale.map((row) => row.requestNumber).sort(),
      ['BPR-1786349778733', 'BPR-1786365940215'],
    );

    const tx = {
      branchPurchaseRequest: {
        findMany: prisma.branchPurchaseRequest.findMany,
        update: async ({ where, data }: { where: { id: string }; data: { status: BranchPurchaseRequestStatus } }) => {
          updates.push({ id: where.id, status: data.status });
          return { id: where.id, status: data.status };
        },
      },
      branchDistributionOrder: { findMany: prisma.branchDistributionOrder.findMany },
      branchInvoice: { findMany: prisma.branchInvoice.findMany },
      auditLog: {
        create: async ({ data }: { data: { action: string; metadata: Record<string, unknown> } }) => {
          auditCalls.push({ action: data.action, metadata: data.metadata });
        },
      },
    };

    for (const row of stale) {
      assert.equal(
        shouldRepairBprStatusForRejectedInstallment({
          bprStatus: row.bprStatus,
          installmentStatus: row.installmentStatus,
        }),
        true,
      );
      await repairBprInstallmentRejectionStatusInTx(tx, {
        bprId: row.bprId,
        requestNumber: row.requestNumber,
        oldStatus: row.bprStatus,
        installmentId: row.installmentId,
      });
    }

    assert.equal(updates.length, 2);
    assert.ok(updates.every((row) => row.status === BranchPurchaseRequestStatus.REJECTED));
    assert.ok(auditCalls.some((row) => row.action === 'HQ_CEO_BPR_REJECTED'));
    assert.ok(auditCalls.some((row) => row.action === 'BPR_STATUS_CHANGED'));
  });
});
