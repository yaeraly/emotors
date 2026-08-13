import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchDistributionOrderStatus } from '@prisma/client';
import {
  HQ_WAREHOUSE_CANCEL_FORBIDDEN_MESSAGE,
  isHqWarehouseAllowedTransition,
  isHqWarehouseBlockedTargetStatus,
} from './hq-warehouse-status-transition.util';

describe('hq-warehouse-status-transition.util', () => {
  it('permits only warehouse execution transitions', () => {
    assert.equal(
      isHqWarehouseAllowedTransition(
        BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
        BranchDistributionOrderStatus.PICKING,
      ),
      true,
    );
    assert.equal(
      isHqWarehouseAllowedTransition(
        BranchDistributionOrderStatus.PICKING,
        BranchDistributionOrderStatus.PACKED,
      ),
      true,
    );
    assert.equal(
      isHqWarehouseAllowedTransition(
        BranchDistributionOrderStatus.PACKED,
        BranchDistributionOrderStatus.SHIPPED,
      ),
      true,
    );
  });

  it('blocks CANCELLED / destructive targets', () => {
    assert.equal(isHqWarehouseBlockedTargetStatus(BranchDistributionOrderStatus.CANCELLED), true);
    assert.equal(
      isHqWarehouseAllowedTransition(
        BranchDistributionOrderStatus.SENT_TO_WAREHOUSE,
        BranchDistributionOrderStatus.CANCELLED,
      ),
      false,
    );
    assert.equal(
      isHqWarehouseAllowedTransition(
        BranchDistributionOrderStatus.PICKING,
        BranchDistributionOrderStatus.CANCELLED,
      ),
      false,
    );
  });

  it('exposes the required Russian forbidden message', () => {
    assert.equal(
      HQ_WAREHOUSE_CANCEL_FORBIDDEN_MESSAGE,
      'У менеджера склада HQ нет права отменять заказ филиала.',
    );
  });
});
