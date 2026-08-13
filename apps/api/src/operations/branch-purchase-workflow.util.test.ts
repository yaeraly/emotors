import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import { resolveBranchPurchaseWorkflowLabel } from './branch-purchase-workflow.util';

describe('resolveBranchPurchaseWorkflowLabel', () => {
  it('maps core workflow stages', () => {
    assert.equal(
      resolveBranchPurchaseWorkflowLabel(BranchPurchaseRequestStatus.SUBMITTED_TO_HQ),
      'WAITING_FOR_HQ_SALES_REVIEW',
    );
    assert.equal(
      resolveBranchPurchaseWorkflowLabel(BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION),
      'WAITING_FOR_BRANCH_CONFIRMATION',
    );
    assert.equal(
      resolveBranchPurchaseWorkflowLabel(BranchPurchaseRequestStatus.BRANCH_CONFIRMED),
      'WAITING_FOR_BRANCH_ACCOUNTANT',
    );
    assert.equal(
      resolveBranchPurchaseWorkflowLabel(BranchPurchaseRequestStatus.PAYMENT_SUBMITTED),
      'WAITING_FOR_HQ_ACCOUNTANT_CONFIRMATION',
    );
    assert.equal(
      resolveBranchPurchaseWorkflowLabel(BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE),
      'READY_FOR_HQ_WAREHOUSE',
    );
  });
});
