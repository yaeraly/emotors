import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { validateRetailMarkups } from './product-markup-resolution.util';
import {
  assertHqCatalogCustomerTypePriceOrder,
  PRICING_POLICY_SCOPE,
} from './pricing-scope-validation.util';

describe('pricing scope validation separation', () => {
  it('HQ retail markup save uses retail-only validation, not cross-channel price order', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'pricing-catalog.service.ts'),
      'utf8',
    );
    const updateRetailStart = source.indexOf('async updateRetailPricing(');
    assert.ok(updateRetailStart >= 0, 'updateRetailPricing missing');
    const nextMethod = source.indexOf('\n  async ', updateRetailStart + 1);
    const updateRetailBlock = source.slice(updateRetailStart, nextMethod);

    assert.doesNotMatch(
      updateRetailBlock,
      /Price order must be Retail > Master > Wholesale/,
      'HQ retail save must not enforce cross-channel price order',
    );
    assert.match(updateRetailBlock, /validateRetailMarkups\(/);
  });

  it('allows HQ retail markups when retail/master/wholesale derived prices are not ordered', () => {
    const validation = validateRetailMarkups({
      minimumRetailMarkupPercent: 10,
      recommendedRetailMarkupPercent: 20,
      inheritedMaximumRetailMarkupPercent: 30,
      effectiveMaximumRetailMarkupPercent: 30,
      maximumRetailMarkupSource: 'INHERITED',
    });
    assert.equal(validation.validationStatus, 'OK');

    assert.throws(
      () =>
        assertHqCatalogCustomerTypePriceOrder({
          retailPriceKgs: 100,
          masterPriceKgs: 150,
          wholesalePriceKgs: 120,
        }),
      /Price order must be Retail > Master > Wholesale/,
    );
  });

  it('documents separate HQ catalog and branch profile scopes', () => {
    assert.equal(PRICING_POLICY_SCOPE.HQ_CATALOG, 'HQ_CATALOG');
    assert.equal(PRICING_POLICY_SCOPE.BRANCH_PROFILE, 'BRANCH_PROFILE');
  });

  it('retail catalog list uses HQ transfer base, not franchise engine branch purchase', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'pricing-catalog.service.ts'),
      'utf8',
    );
    const blockStart = source.indexOf('private async toEngineRetailCatalogRow(');
    const blockEnd = source.indexOf('\n  private async toEngineWholesaleCatalogRow(', blockStart);
    const block = source.slice(blockStart, blockEnd);

    assert.match(block, /resolveHqTransferBasePriceKgs\(/);
    assert.doesNotMatch(block, /PricingEnginePriceType\.BRANCH_PURCHASE/);
  });
});
