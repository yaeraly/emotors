import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeBranchHqReturnDifferenceQuantity,
  sortBranchHqReturnItemsForPickingDisplay,
} from './branch-hq-return-display.util';

describe('branch hq return display', () => {
  it('computes difference as sent - received', () => {
    assert.equal(computeBranchHqReturnDifferenceQuantity(7, 6), 1);
    assert.equal(computeBranchHqReturnDifferenceQuantity(7, 7), 0);
  });

  it('keeps unpicked return items first after pick', () => {
    const items = [
      { id: 'a', pickedAt: '2026-08-12T10:00:00.000Z' },
      { id: 'b', pickedAt: null },
      { id: 'c', pickedAt: null },
    ];
    const sorted = sortBranchHqReturnItemsForPickingDisplay(items);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['b', 'c', 'a'],
    );
  });
});
