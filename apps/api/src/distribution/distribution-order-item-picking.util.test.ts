import { BranchDistributionOrderStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertAllDistributionItemsPicked,
  assertDistributionOrderItemPickingAllowed,
  buildDistributionPickingProgress,
} from './distribution-order-item-picking.util';

describe('distribution order item picking', () => {
  it('counts picked positions from persisted pickedAt', () => {
    const progress = buildDistributionPickingProgress([
      { quantity: 10, pickedAt: new Date('2026-08-09T10:00:00.000Z') },
      { quantity: 5, pickedAt: new Date('2026-08-09T10:05:00.000Z') },
      { quantity: 20, pickedAt: null },
      { quantity: 4, pickedAt: null },
    ]);

    assert.deepEqual(progress, {
      pickedCount: 2,
      totalCount: 4,
      remainingCount: 2,
    });
  });

  it('ignores zero-quantity rows', () => {
    const progress = buildDistributionPickingProgress([
      { quantity: 0, pickedAt: null },
      { quantity: 3, pickedAt: new Date() },
    ]);

    assert.equal(progress.totalCount, 1);
    assert.equal(progress.pickedCount, 1);
    assert.equal(progress.remainingCount, 0);
  });

  it('blocks packing until every required row is picked', () => {
    assert.throws(
      () =>
        assertAllDistributionItemsPicked([
          { quantity: 1, pickedAt: new Date() },
          { quantity: 2, pickedAt: null },
        ]),
      /не все товары собраны/i,
    );
  });

  it('allows packing when all required rows are picked', () => {
    const progress = assertAllDistributionItemsPicked([
      { quantity: 1, pickedAt: new Date() },
      { quantity: 2, pickedAt: new Date() },
    ]);

    assert.equal(progress.remainingCount, 0);
  });

  it('allows item picking changes only during PICKING status', () => {
    assert.doesNotThrow(() =>
      assertDistributionOrderItemPickingAllowed(BranchDistributionOrderStatus.PICKING),
    );
    assert.throws(
      () => assertDistributionOrderItemPickingAllowed(BranchDistributionOrderStatus.PACKED),
      /этапе «Сборка»/i,
    );
  });
});
