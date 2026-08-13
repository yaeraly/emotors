import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBranchCatalogInventoryCost } from './branch-product-directory-cost';

describe('formatBranchCatalogInventoryCost', () => {
  it('formats authoritative branch FIFO cost with two decimals and сом suffix', () => {
    assert.equal(
      formatBranchCatalogInventoryCost({
        branchInventoryCostAvailable: true,
        currentBranchInventoryCost: 5085.33,
      }),
      '5 085,33 сом',
    );
  });

  it('returns em dash when branch stock is unavailable', () => {
    assert.equal(
      formatBranchCatalogInventoryCost({
        branchInventoryCostAvailable: false,
        currentBranchInventoryCost: 100,
      }),
      '—',
    );
  });

  it('returns em dash for zero or invalid cost', () => {
    assert.equal(
      formatBranchCatalogInventoryCost({
        branchInventoryCostAvailable: true,
        currentBranchInventoryCost: 0,
      }),
      '—',
    );
    assert.equal(
      formatBranchCatalogInventoryCost({
        branchInventoryCostAvailable: true,
        currentBranchInventoryCost: Number.NaN,
      }),
      '—',
    );
  });
});
