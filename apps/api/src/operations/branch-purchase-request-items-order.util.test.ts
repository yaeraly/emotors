import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  branchPurchaseRequestItemsOrderBy,
  sortBranchPurchaseRequestItems,
} from './branch-purchase-request-items-order.util';

describe('branch purchase request item ordering', () => {
  it('uses ascending position as the primary sort key', () => {
    assert.deepEqual(branchPurchaseRequestItemsOrderBy, { position: 'asc' });

    const items = sortBranchPurchaseRequestItems([
      { id: 'c', position: 3, productName: 'Камера', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a', position: 1, productName: 'Контроллер', createdAt: '2026-01-01T00:00:02.000Z' },
      { id: 'b', position: 2, productName: 'Мотор', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);

    assert.deepEqual(
      items.map((item) => item.productName),
      ['Контроллер', 'Мотор', 'Камера'],
    );
  });

  it('falls back to createdAt and id when position ties', () => {
    const items = sortBranchPurchaseRequestItems([
      { id: 'line-b', position: 0, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'line-a', position: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'line-c', position: 0, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    assert.deepEqual(items.map((item) => item.id), ['line-a', 'line-c', 'line-b']);
  });

  it('preserves submitted A,B,C,D order after approval status changes', () => {
    const items = sortBranchPurchaseRequestItems([
      { id: 'd', position: 4, productName: 'D', lineStatus: 'PENDING_REVIEW' },
      { id: 'b', position: 2, productName: 'B', lineStatus: 'APPROVED' },
      { id: 'a', position: 1, productName: 'A', lineStatus: 'REJECTED' },
      { id: 'c', position: 3, productName: 'C', lineStatus: 'PENDING_REVIEW' },
    ]);

    assert.deepEqual(
      items.map((item) => item.productName),
      ['A', 'B', 'C', 'D'],
    );
  });
});
