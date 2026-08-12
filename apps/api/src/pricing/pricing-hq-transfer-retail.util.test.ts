import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { applyMarkupRoundUp, resolveHqTransferBasePriceKgs } from './pricing-calculator.util';
import { calculateRetailPricesFromBranchPrice } from './product-markup-resolution.util';
import {
  HQ_PRICING_CHANNEL,
  validateHqTransferMarkupSave,
} from './pricing-scope-validation.util';
import { validatePricingTiers } from './pricing-calculator.util';

describe('HQ transfer to retail pricing dependency', () => {
  it('Продажа филиалам save does not use cross-tier validateMarkups', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'pricing-catalog.service.ts'),
      'utf8',
    );
    const blockStart = source.indexOf('async updateFranchiseSalesProduct(');
    const blockEnd = source.indexOf('\n  async listBranches(', blockStart);
    const block = source.slice(blockStart, blockEnd);

    assert.doesNotMatch(block, /validateMarkups\(/);
    assert.match(block, /validateHqTransferMarkupSave\(/);
    assert.match(block, /calculateRetailPricesFromBranchPrice\(/);
  });

  it('uses stored HQ transfer price as Retail Закупка when available', () => {
    assert.equal(
      resolveHqTransferBasePriceKgs({
        hqBranchWholesalePriceKgs: 2200,
        costPriceKgs: 1000,
        hqBranchWholesaleMarkupPercent: 10,
      }),
      2200,
    );
  });

  it('recalculates retail min/rec/max from HQ transfer base and saved markups', () => {
    const base = 2000;
    const prices = calculateRetailPricesFromBranchPrice(base, {
      minimumRetailMarkupPercent: 20,
      recommendedRetailMarkupPercent: 30,
      effectiveMaximumRetailMarkupPercent: 40,
    });

    assert.equal(prices.minimumRetailPriceKgs, applyMarkupRoundUp(base, 20));
    assert.equal(prices.recommendedRetailPriceKgs, applyMarkupRoundUp(base, 30));
    assert.equal(prices.maximumRetailPriceKgs, applyMarkupRoundUp(base, 40));
  });

  it('allows HQ transfer save when wholesale exceeds retail recommended (cross-tier still blocked elsewhere)', () => {
    assert.equal(validateHqTransferMarkupSave(25), null);

    const tierError = validatePricingTiers({
      branchPurchasePriceKgs: 2000,
      wholesalePriceKgs: 2500,
      hqBranchWholesalePriceKgs: 2000,
      recommendedRetailPriceKgs: 2400,
      minimumSellingPriceKgs: 2200,
    });
    assert.equal(tierError, 'Wholesale price cannot exceed recommended retail price');
  });

  it('documents HQ pricing channels', () => {
    assert.equal(HQ_PRICING_CHANNEL.HQ_TRANSFER, 'HQ_TRANSFER');
    assert.equal(HQ_PRICING_CHANNEL.HQ_RETAIL, 'HQ_RETAIL');
    assert.equal(HQ_PRICING_CHANNEL.HQ_WHOLESALE, 'HQ_WHOLESALE');
  });
});
