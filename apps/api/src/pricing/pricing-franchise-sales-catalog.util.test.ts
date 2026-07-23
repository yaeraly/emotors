/**
 * Franchise-sales catalog must start from active HQ products and never drop
 * rows that lack FIFO layers, stock, or markup rules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type CatalogProduct = {
  id: string;
  isActive: boolean;
  sku: string;
};

type FifoCost = { available: boolean; costPriceKgs: number | null };
type Markup = { configured: boolean };

function listFranchiseSalesRows(
  catalog: CatalogProduct[],
  fifoById: Record<string, FifoCost>,
  markupById: Record<string, Markup>,
) {
  return catalog
    .filter((p) => p.isActive)
    .map((p) => {
      const fifo = fifoById[p.id] ?? { available: false, costPriceKgs: null };
      const markup = markupById[p.id] ?? { configured: false };
      return {
        id: p.id,
        sku: p.sku,
        costPriceKgs: fifo.available ? fifo.costPriceKgs : null,
        costAvailable: Boolean(fifo.available && (fifo.costPriceKgs ?? 0) > 0),
        markupConfigured: markup.configured,
      };
    });
}

describe('franchise-sales catalog inclusion', () => {
  it('includes active products without FIFO, stock, or markup', () => {
    const catalog = [
      { id: '1', isActive: true, sku: 'SUS001' },
      { id: '2', isActive: true, sku: 'AAA' },
      { id: '3', isActive: false, sku: 'ZZZ' },
    ];
    const rows = listFranchiseSalesRows(
      catalog,
      {
        '1': { available: true, costPriceKgs: 350 },
        '2': { available: false, costPriceKgs: null },
      },
      {
        '1': { configured: true },
        '2': { configured: false },
      },
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.sku, 'SUS001');
    assert.equal(rows[0]?.costPriceKgs, 350);
    assert.equal(rows[1]?.sku, 'AAA');
    assert.equal(rows[1]?.costPriceKgs, null);
    assert.equal(rows[1]?.costAvailable, false);
    assert.equal(rows[1]?.markupConfigured, false);
  });

  it('never presents 0 as a valid missing FIFO cost', () => {
    const rows = listFranchiseSalesRows(
      [{ id: '1', isActive: true, sku: 'X' }],
      { '1': { available: false, costPriceKgs: null } },
      { '1': { configured: false } },
    );
    assert.equal(rows[0]?.costPriceKgs, null);
    assert.notEqual(rows[0]?.costPriceKgs, 0);
  });
});
