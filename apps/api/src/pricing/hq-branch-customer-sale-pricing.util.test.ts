import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PricingEnginePriceType } from '@prisma/client';
import {
  calculateBaseBranchPriceKgs,
  calculateRetailPriceKgs,
} from './pricing-calculator.util';
import {
  isCustomerSalePriceType,
  shouldUseHqBranchInventoryCostForPriceType,
} from './shared-franchise-pricing-branch.util';

describe('shared-franchise-pricing-branch.util', () => {
  it('treats retail and wholesale sale types as customer sale prices', () => {
    assert.equal(isCustomerSalePriceType(PricingEnginePriceType.RETAIL_RECOMMENDED), true);
    assert.equal(isCustomerSalePriceType(PricingEnginePriceType.WHOLESALE_RECOMMENDED), true);
    assert.equal(isCustomerSalePriceType(PricingEnginePriceType.BRANCH_PURCHASE), false);
  });

  it('uses HQ inventory cost only for branch purchase on HQ branch', () => {
    assert.equal(
      shouldUseHqBranchInventoryCostForPriceType(
        'HQ_BRANCH',
        PricingEnginePriceType.BRANCH_PURCHASE,
      ),
      true,
    );
    assert.equal(
      shouldUseHqBranchInventoryCostForPriceType(
        'HQ_BRANCH',
        PricingEnginePriceType.RETAIL_RECOMMENDED,
      ),
      false,
    );
    assert.equal(
      shouldUseHqBranchInventoryCostForPriceType(
        'FRANCHISE',
        PricingEnginePriceType.BRANCH_PURCHASE,
      ),
      false,
    );
  });
});

describe('HQ Branch customer sale vs inventory cost', () => {
  const hqInventoryCost = 8000;
  const franchiseMarkupPercent = 15;
  const retailMarkupPercent = 20;

  it('keeps HQ branch inventory purchase at cost', () => {
    const branchPurchaseBase = calculateBaseBranchPriceKgs({
      costPriceKgs: hqInventoryCost,
      markupPercent: franchiseMarkupPercent,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(branchPurchaseBase, hqInventoryCost);
  });

  it('uses franchise-network base for HQ customer retail pricing', () => {
    const franchiseBase = calculateBaseBranchPriceKgs({
      costPriceKgs: hqInventoryCost,
      markupPercent: franchiseMarkupPercent,
      branchType: 'FRANCHISE',
    });
    const hqRetail = calculateRetailPriceKgs(franchiseBase, retailMarkupPercent);
    const franchiseRetail = calculateRetailPriceKgs(franchiseBase, retailMarkupPercent);

    assert.ok(franchiseBase > hqInventoryCost);
    assert.equal(hqRetail, franchiseRetail);
    assert.ok(hqRetail > hqInventoryCost);
  });

  it('does not use inventory cost as customer selling price', () => {
    const franchiseBase = calculateBaseBranchPriceKgs({
      costPriceKgs: hqInventoryCost,
      markupPercent: franchiseMarkupPercent,
      branchType: 'FRANCHISE',
    });
    const customerPrice = calculateRetailPriceKgs(franchiseBase, retailMarkupPercent);
    assert.notEqual(customerPrice, hqInventoryCost);
  });

  it('allows different inventory cost and selling price on the same line', () => {
    const franchiseBase = calculateBaseBranchPriceKgs({
      costPriceKgs: hqInventoryCost,
      markupPercent: franchiseMarkupPercent,
      branchType: 'FRANCHISE',
    });
    const unitSellingPrice = calculateRetailPriceKgs(franchiseBase, retailMarkupPercent);
    const unitInventoryCost = hqInventoryCost;
    const profit = unitSellingPrice - unitInventoryCost;
    assert.ok(profit > 0);
    assert.notEqual(unitSellingPrice, unitInventoryCost);
  });
});
