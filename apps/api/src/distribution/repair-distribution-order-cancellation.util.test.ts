import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchDistributionOrderStatus,
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
  HqWarehousePickingTaskStatus,
  Role,
} from '@prisma/client';
import {
  buildRepairPlan,
  deriveRestoredDistributionStatus,
  isUnauthorizedWarehouseCancellation,
} from './repair-distribution-order-cancellation.util';

const ORDER_ID = 'dist-order-1';
const BPR_ID = 'bpr-1';
const INSTALLMENT_ID = 'inst-1';

function basePlanInput(overrides: Partial<Parameters<typeof buildRepairPlan>[0]> = {}) {
  return {
    order: {
      id: ORDER_ID,
      orderNumber: 'DO-BPR-1785498054695',
      status: BranchDistributionOrderStatus.CANCELLED,
      cancelledAt: new Date('2026-08-01T10:00:00Z'),
      sentAt: null,
      branchId: 'branch-1',
      sourceWarehouseId: 'wh-1',
    },
    bpr: {
      id: BPR_ID,
      requestNumber: 'BPR-1785498054695',
      status: BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
    },
    installment: {
      id: INSTALLMENT_ID,
      status: BranchOrderInstallmentStatus.APPROVED,
      approvedById: 'ceo-1',
      decidedAt: new Date('2026-08-01T09:00:00Z'),
      firstPaymentAmount: 0,
    },
    pickingTask: null,
    bookings: [{ id: 'booking-1', status: 'CONFIRMED', bookedQuantity: 5, confirmedQuantity: 5 }],
    audits: [],
    bprAudits: [],
    invoicePaid: false,
    duplicateActiveOrders: 0,
    duplicateShippedOrders: 0,
    hasStockMovementsOut: false,
    goodsReceivingId: null,
    ...overrides,
  };
}

describe('repair-distribution-order-cancellation.util', () => {
  it('detects unauthorized HQ Warehouse cancellation for approved installment', () => {
    assert.equal(
      isUnauthorizedWarehouseCancellation(
        BranchDistributionOrderStatus.CANCELLED,
        BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
        {
          id: INSTALLMENT_ID,
          status: BranchOrderInstallmentStatus.APPROVED,
          approvedById: 'ceo-1',
          decidedAt: new Date(),
          firstPaymentAmount: 0,
        },
        Role.WAREHOUSE_MANAGER,
        'INFERRED_POST_distribution_orders_cancel_NO_AUDIT',
        [],
      ),
      true,
    );
  });

  it('dry-run reports planned restoration for DO-BPR-1785498054695 shape', () => {
    const plan = buildRepairPlan(basePlanInput());
    assert.equal(plan.investigation.distributionOrderNumber, 'DO-BPR-1785498054695');
    assert.equal(plan.investigation.installmentStatus, BranchOrderInstallmentStatus.APPROVED);
    assert.equal(plan.safety.safe, true);
    assert.equal(plan.plannedDistributionStatus, BranchDistributionOrderStatus.SENT_TO_WAREHOUSE);
    assert.equal(plan.plannedBprStatus, BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE);
    assert.equal(plan.needsPickingTask, true);
    assert.match(plan.plannedChanges.join(' '), /cancelledAt: clear/);
  });

  it('derives picking status from existing picking task', () => {
    const status = deriveRestoredDistributionStatus(
      null,
      {
        id: 'task-1',
        status: HqWarehousePickingTaskStatus.PICKING,
        pickedAt: new Date(),
        packedAt: null,
        shippedAt: null,
      },
      {
        id: INSTALLMENT_ID,
        status: BranchOrderInstallmentStatus.APPROVED,
        approvedById: 'ceo-1',
        decidedAt: new Date(),
        firstPaymentAmount: 0,
      },
      false,
    );
    assert.equal(status, BranchDistributionOrderStatus.PICKING);
  });

  it('blocks repair when branch purchase request was commercially cancelled', () => {
    const plan = buildRepairPlan(
      basePlanInput({
        bpr: {
          id: BPR_ID,
          requestNumber: 'BPR-1785498054695',
          status: BranchPurchaseRequestStatus.CANCELLED,
        },
      }),
    );
    assert.equal(plan.safety.safe, false);
    assert.ok(plan.safety.blockingRisks.includes('BRANCH_PURCHASE_REQUEST_COMMERCIALLY_CANCELLED'));
  });

  it('is idempotent when order is already restored', () => {
    const plan = buildRepairPlan(
      basePlanInput({
        order: {
          id: ORDER_ID,
          orderNumber: 'DO-BPR-1785498054695',
          status: BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
          cancelledAt: null,
          sentAt: null,
          branchId: 'branch-1',
          sourceWarehouseId: 'wh-1',
        },
      }),
    );
    assert.equal(plan.alreadyRestored, true);
    assert.equal(plan.plannedDistributionStatus, null);
  });

  it('zero-initial approved installment targets warehouse-ready distribution status', () => {
    const plan = buildRepairPlan(
      basePlanInput({
        installment: {
          id: INSTALLMENT_ID,
          status: BranchOrderInstallmentStatus.APPROVED,
          approvedById: 'ceo-1',
          decidedAt: new Date(),
          firstPaymentAmount: 0,
        },
      }),
    );
    assert.equal(plan.plannedDistributionStatus, BranchDistributionOrderStatus.SENT_TO_WAREHOUSE);
    assert.equal(plan.safety.safe, true);
  });
});
