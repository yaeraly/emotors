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
  AUTHORIZED_DISTRIBUTION_CANCEL_ROLES,
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
    missingFifoReservations: true,
    ...overrides,
  };
}

describe('repair-distribution-order-cancellation.util', () => {
  it('finds DO-BPR-1785498054695 shape and detects HQ Warehouse cancellation actor', () => {
    const plan = buildRepairPlan(basePlanInput());
    assert.equal(plan.investigation.distributionOrderNumber, 'DO-BPR-1785498054695');
    assert.equal(plan.investigation.branchOrderNumber, 'BPR-1785498054695');
    assert.equal(plan.investigation.cancelledByRole, Role.WAREHOUSE_MANAGER);
    assert.equal(
      plan.investigation.cancellationSource,
      'INFERRED_POST_distribution_orders_cancel_NO_AUDIT',
    );
  });

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

  it('dry-run reports exact planned restoration fields', () => {
    const plan = buildRepairPlan(basePlanInput());
    assert.equal(plan.safety.safe, true);
    assert.equal(plan.dryRunSummary.orderId, ORDER_ID);
    assert.equal(plan.dryRunSummary.orderNumber, 'DO-BPR-1785498054695');
    assert.equal(plan.dryRunSummary.currentStatus, BranchDistributionOrderStatus.CANCELLED);
    assert.equal(plan.dryRunSummary.correctStatus, BranchDistributionOrderStatus.SENT_TO_WAREHOUSE);
    assert.equal(plan.dryRunSummary.installmentStatus, BranchOrderInstallmentStatus.APPROVED);
    assert.match(plan.dryRunSummary.hqCeoApproval ?? '', /APPROVED by ceo-1/);
    assert.equal(plan.dryRunSummary.cancellationRole, Role.WAREHOUSE_MANAGER);
    assert.deepEqual(plan.dryRunSummary.existingReservation, ['booking-1']);
    assert.equal(plan.dryRunSummary.existingShipment, null);
    assert.ok(plan.dryRunSummary.plannedChanges.length > 0);
    assert.deepEqual(plan.dryRunSummary.blockingRisks, []);
    assert.equal(plan.needsPickingTask, true);
    assert.equal(plan.restoreInventoryReservations, true);
    assert.equal(plan.restoreFifoReservations, true);
    assert.match(plan.plannedChanges.join(' '), /cancelledAt: clear/);
  });

  it('derives picking status from existing picking task and does not move backward', () => {
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

    const plan = buildRepairPlan(
      basePlanInput({
        pickingTask: {
          id: 'task-1',
          status: HqWarehousePickingTaskStatus.PICKING,
          pickedAt: new Date(),
          packedAt: null,
          shippedAt: null,
        },
      }),
    );
    assert.equal(plan.plannedDistributionStatus, BranchDistributionOrderStatus.PICKING);
    assert.equal(plan.needsPickingTask, false);
  });

  it('preserves existing installment approval and quantities/prices unchanged in plan', () => {
    const plan = buildRepairPlan(basePlanInput());
    assert.equal(plan.investigation.installmentId, INSTALLMENT_ID);
    assert.equal(plan.investigation.installmentStatus, BranchOrderInstallmentStatus.APPROVED);
    assert.equal(plan.investigation.installmentApprovedBy, 'ceo-1');
    assert.ok(
      !plan.plannedChanges.some((c) =>
        /item\.quantity|unitPrice|totalAmount|remainingDebt|firstPaymentAmount/i.test(c),
      ),
    );
  });

  it('does not plan duplicate warehouse task when one already exists', () => {
    const plan = buildRepairPlan(
      basePlanInput({
        pickingTask: {
          id: 'task-existing',
          status: HqWarehousePickingTaskStatus.ASSIGNED,
          pickedAt: null,
          packedAt: null,
          shippedAt: null,
        },
      }),
    );
    assert.equal(plan.needsPickingTask, false);
    assert.equal(plan.investigation.warehouseTaskId, 'task-existing');
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

  it('blocks repair when authorized commercial role cancelled', () => {
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
        Role.CEO,
        'DISTRIBUTION_ORDER_CANCELLED',
        [],
      ),
      false,
    );
    assert.ok(AUTHORIZED_DISTRIBUTION_CANCEL_ROLES.includes(Role.CEO));
    assert.ok(AUTHORIZED_DISTRIBUTION_CANCEL_ROLES.includes(Role.HQ_SALES_MANAGER));
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
    assert.equal(plan.restoreInventoryReservations, false);
    assert.equal(plan.needsPickingTask, false);
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

  it('blocks when duplicate active distribution order exists', () => {
    const plan = buildRepairPlan(basePlanInput({ duplicateActiveOrders: 1 }));
    assert.equal(plan.safety.safe, false);
    assert.ok(plan.safety.blockingRisks.includes('DUPLICATE_ACTIVE_DISTRIBUTION_ORDER_EXISTS'));
  });

  it('blocks when products already shipped on another order', () => {
    const plan = buildRepairPlan(basePlanInput({ duplicateShippedOrders: 1 }));
    assert.equal(plan.safety.safe, false);
    assert.ok(plan.safety.blockingRisks.includes('PRODUCT_ALREADY_SHIPPED_ON_ANOTHER_ORDER'));
  });
});
