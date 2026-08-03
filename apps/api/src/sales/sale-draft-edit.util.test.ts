import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role, SaleStatus } from '@prisma/client';
import {
  assertSaleDraftEditable,
  buildDraftSaleSnapshot,
  diffDraftSaleItemChanges,
  editableDraftStatusesForUser,
  SALE_DRAFT_EDIT_BLOCKED_MESSAGE,
} from './sale-draft-edit.util';

const branchSalesManager = {
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
};

const branchOwner = {
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
};

describe('sale draft edit authorization', () => {
  it('allows branch sales manager to edit only draft status', () => {
    assert.deepEqual(editableDraftStatusesForUser(branchSalesManager), [SaleStatus.DRAFT]);
    assert.doesNotThrow(() =>
      assertSaleDraftEditable(branchSalesManager, { status: SaleStatus.DRAFT }),
    );
  });

  it('rejects branch sales manager editing non-draft sales', () => {
    assert.throws(
      () => assertSaleDraftEditable(branchSalesManager, { status: SaleStatus.FINALIZED }),
      (error: Error) => error.message === SALE_DRAFT_EDIT_BLOCKED_MESSAGE,
    );
  });

  it('allows branch owner to edit sent-to-customer drafts', () => {
    assert.deepEqual(editableDraftStatusesForUser(branchOwner), [
      SaleStatus.DRAFT,
      SaleStatus.SENT_TO_CUSTOMER,
    ]);
    assert.doesNotThrow(() =>
      assertSaleDraftEditable(branchOwner, { status: SaleStatus.SENT_TO_CUSTOMER }),
    );
  });
});

describe('sale draft edit diff', () => {
  it('detects added, removed, and price-changed items', () => {
    const previous = buildDraftSaleSnapshot({
      customerId: 'customer-1',
      notes: 'old',
      totalAmount: 1000,
      pricingPolicyVersionId: 'policy-1',
      items: [
        {
          productId: 'p1',
          productSku: 'SKU-1',
          productName: 'One',
          quantity: 1,
          unitPrice: 1000,
        },
      ],
    });

    const diff = diffDraftSaleItemChanges(previous.items, [
      {
        productId: 'p1',
        productSku: 'SKU-1',
        productName: 'One',
        quantity: 1,
        unitPrice: 1100,
      },
      {
        productId: 'p2',
        productSku: 'SKU-2',
        productName: 'Two',
        quantity: 2,
        unitPrice: 500,
      },
    ]);

    assert.equal(diff.removed.length, 0);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0]?.productId, 'p2');
    assert.equal(diff.priceChanged.length, 1);
    assert.equal(diff.priceChanged[0]?.previousPrice, 1000);
    assert.equal(diff.priceChanged[0]?.newPrice, 1100);
  });
});
