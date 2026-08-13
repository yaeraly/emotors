import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  canEditDraftSale,
  draftSaleEditHref,
  mapSaleItemToFormSeed,
  resolvePaymentTypeFromSale,
} from './sale-draft-edit';
import type { Sale } from './types';

const branchSalesManager = {
  id: 'user-1',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
  email: 'manager@example.com',
  fullName: 'Manager',
};

describe('sale draft edit helpers', () => {
  it('shows edit only for draft sales', () => {
    assert.equal(
      canEditDraftSale(branchSalesManager, { status: 'DRAFT', deletedAt: null }),
      true,
    );
    assert.equal(
      canEditDraftSale(branchSalesManager, { status: 'FINALIZED', deletedAt: null }),
      false,
    );
  });

  it('builds edit href for registration form reuse', () => {
    assert.equal(draftSaleEditHref('sale-1'), '/sales/new?edit=sale-1');
  });

  it('restores saved sale price and quantity into form seed', () => {
    const seed = mapSaleItemToFormSeed(
      {
        id: 'item-1',
        saleId: 'sale-1',
        productId: 'product-1',
        productName: 'Battery',
        productSku: 'BAT-1',
        quantity: 3,
        unitPrice: 1150,
        unitCost: 0,
        totalPrice: 3450,
        totalCost: 0,
        profitAmount: 3450,
        recommendedPriceSnapshot: 1200,
        minimumPriceSnapshot: 1000,
        maximumPriceSnapshot: 1400,
        priceChangedManually: true,
        createdAt: '2026-08-03T00:00:00.000Z',
      },
      null,
      null,
    );
    assert.equal(seed.quantity, '3');
    assert.equal(seed.unitPrice, '1150');
    assert.equal(seed.unitPriceManuallyEdited, true);
    assert.equal(seed.recommendedPrice, 1200);
  });

  it('detects installment payment type from saved draft', () => {
    const sale = {
      installmentApproval: { id: 'approval-1' },
      installments: [],
    } as unknown as Sale;
    assert.equal(resolvePaymentTypeFromSale(sale), 'INSTALLMENT');
  });
});

describe('sales list draft edit action', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/page.tsx'),
    'utf8',
  );

  it('renders edit action only through draft helper', () => {
    assert.match(pageSource, /canEditDraftSale\(user, sale\)/);
    assert.match(pageSource, /draftSaleEditHref\(sale\.id\)/);
    assert.match(pageSource, /common\.edit/);
  });
});

describe('sale registration draft edit route', () => {
  const pageSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/new/page.tsx'),
    'utf8',
  );

  it('loads existing draft by edit query parameter', () => {
    assert.match(pageSource, /searchParams\.get\('edit'\)/);
    assert.match(pageSource, /loadExistingDraft/);
    assert.match(pageSource, /method: draftSale \? 'PUT' : 'POST'/);
  });
});
