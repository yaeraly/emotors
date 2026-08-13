import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { branchSalesManagerNavModules } from './unified-nav';

describe('branch sales navigation', () => {
  it('does not expose separate retail, wholesale, or new-sale menu routes', () => {
    const salesModule = branchSalesManagerNavModules.find((module) => module.id === 'sales');
    assert.ok(salesModule);
    const hrefs = salesModule!.pages.map((page) => page.href);
    assert.ok(hrefs.includes('/sales'));
    assert.equal(hrefs.some((href) => href.includes('/sales/new')), false);
    assert.equal(hrefs.some((href) => href.includes('retail')), false);
    assert.equal(hrefs.some((href) => href.includes('wholesale')), false);
    const labels = salesModule!.pages.map((page) => page.labelKey);
    assert.equal(labels.includes('sales.newSale'), false);
  });
});
