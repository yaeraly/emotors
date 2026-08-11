import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDistributionOrderItemPickedForDisplay,
  sortDistributionOrderItemsForPickingDisplay,
} from './distribution-order-picking-display.util';

type TestItem = {
  id: string;
  pickedAt?: string | null;
};

function item(id: string, pickedAt?: string | null): TestItem {
  return { id, pickedAt: pickedAt ?? null };
}

describe('distribution order picking display sort', () => {
  it('detects picked state from pickedAt', () => {
    assert.equal(isDistributionOrderItemPickedForDisplay({ pickedAt: null }), false);
    assert.equal(isDistributionOrderItemPickedForDisplay({ pickedAt: undefined }), false);
    assert.equal(
      isDistributionOrderItemPickedForDisplay({ pickedAt: '2026-08-11T10:00:00.000Z' }),
      true,
    );
  });

  it('moves first picked item to bottom while unpicked keep original order', () => {
    const items = [item('controller'), item('motor'), item('reducer'), item('camera')];
    const sorted = sortDistributionOrderItemsForPickingDisplay(
      items.map((row, index) =>
        index === 0 ? { ...row, pickedAt: '2026-08-11T10:00:00.000Z' } : row,
      ),
    );
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['motor', 'reducer', 'camera', 'controller'],
    );
  });

  it('accumulates picked rows at bottom in pickedAt order', () => {
    const items = [
      item('controller', '2026-08-11T10:00:00.000Z'),
      item('motor', '2026-08-11T10:01:00.000Z'),
      item('reducer'),
      item('camera'),
    ];
    const sorted = sortDistributionOrderItemsForPickingDisplay(items);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['reducer', 'camera', 'controller', 'motor'],
    );
  });

  it('returns unpicked item to original relative position on undo', () => {
    const items = [
      item('controller', '2026-08-11T10:00:00.000Z'),
      item('motor', '2026-08-11T10:01:00.000Z'),
      item('reducer'),
      item('camera'),
    ];
    const undone = items.map((row) => (row.id === 'motor' ? { ...row, pickedAt: null } : row));
    const sorted = sortDistributionOrderItemsForPickingDisplay(undone);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['motor', 'reducer', 'camera', 'controller'],
    );
  });

  it('does not mutate the source array', () => {
    const items = [item('a'), item('b', '2026-08-11T10:00:00.000Z')];
    const copy = [...items];
    sortDistributionOrderItemsForPickingDisplay(items);
    assert.deepEqual(items, copy);
  });

  it('preserves original order when all items are unpicked', () => {
    const items = [item('a'), item('b'), item('c')];
    const sorted = sortDistributionOrderItemsForPickingDisplay(items);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['a', 'b', 'c'],
    );
  });
});
