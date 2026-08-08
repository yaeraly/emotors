import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import type { User } from './types';
import { shouldShowBranchColumnForBranchScopedTables } from './rbac';

const branchSalesManager = {
  id: 'bsm-1',
  email: 'bsm@test.com',
  fullName: 'Branch Sales Manager',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage'],
} satisfies User;

describe('branch sales manager ui cleanup', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const detailPage = readFileSync(join(root, 'app/branch-purchase-requests/[id]/page.tsx'), 'utf8');
  const listPage = readFileSync(join(root, 'app/branch-purchase-requests/page.tsx'), 'utf8');
  const customersPage = readFileSync(join(root, 'app/customers/page.tsx'), 'utf8');
  const salesPage = readFileSync(join(root, 'app/sales/page.tsx'), 'utf8');
  const myBonusesPage = readFileSync(join(root, 'app/sales/my-bonuses/page.tsx'), 'utf8');

  it('hides branch column for branch sales manager order list', () => {
    assert.equal(shouldShowBranchColumnForBranchScopedTables(branchSalesManager), false);
  });

  it('order detail uses quantity times branch price for line total', () => {
    assert.match(detailPage, /formatLineTotalKgs\(item\)/);
    assert.match(detailPage, /formatFrozenBranchPrice\(item, t\)/);
    assert.match(detailPage, /formatOrderTotalKgs\(request\.items\)/);
    assert.doesNotMatch(detailPage, /formatKgs\(item\.totalAmount\)/);
  });

  it('order detail branch sales manager table has no sku column', () => {
    assert.match(detailPage, /branchSalesManagerView \? \(/);
    assert.doesNotMatch(detailPage, /branchSalesManagerView && !reviewed/);
    assert.match(detailPage, /!branchSalesManagerView \? \(/);
    assert.match(detailPage, /<tfoot/);

    const bsmTableStart = detailPage.indexOf('{branchSalesManagerView ? (');
    const bsmTableEnd = detailPage.indexOf(') : executiveCompactView ? (');
    assert.ok(bsmTableStart >= 0 && bsmTableEnd > bsmTableStart);
    const bsmTable = detailPage.slice(bsmTableStart, bsmTableEnd);
    assert.match(bsmTable, /t\('sales\.product'\)/);
    assert.match(bsmTable, /t\('distribution\.quantity'\)/);
    assert.match(bsmTable, /t\('branchProductRequest\.branchPurchasePrice'\)/);
    assert.match(bsmTable, /t\('branchProductRequest\.totalAmount'\)/);
    assert.doesNotMatch(bsmTable, /inventory\.sku/);
    assert.doesNotMatch(bsmTable, /item\.sku/);
    assert.match(bsmTable, /item\.productName/);
    assert.match(bsmTable, /item\.quantity/);
    assert.match(bsmTable, /formatLineTotalKgs\(item\)/);
    assert.match(bsmTable, /formatOrderTotalKgs\(request\.items\)/);
  });

  it('hides repeated customer history subtitle for branch sales manager', () => {
    assert.match(customersPage, /!branchOwnerView && !branchSalesManagerView/);
    assert.match(customersPage, /crm\.customerHistory/);
  });

  it('hides duplicated sales headings for branch sales manager', () => {
    assert.match(salesPage, /isBranchSalesManagerUser\(user\)/);
    assert.match(salesPage, /hideSalesDuplicateTitles/);
    assert.match(salesPage, /sales\.salesAndPayments/);
  });

  it('hides duplicated my bonuses headings when unified nav is active', () => {
    assert.match(myBonusesPage, /usesUnifiedNavPageTitle/);
    assert.match(myBonusesPage, /showPageTitle/);
    assert.match(myBonusesPage, /nav\.myBonuses/);
  });

  it('list page still supports branch column toggle via rbac helper', () => {
    assert.match(listPage, /shouldShowBranchColumnForBranchScopedTables/);
  });

  it('create and draft product table hides sku column for branch sales manager', () => {
    assert.match(listPage, /branchOnlyView && !branchSalesManagerView/);
    assert.match(listPage, /branchSalesManagerView && \(isCreateMode \|\| Boolean\(draftIdFromUrl\)\)/);

    const formTableStart = listPage.indexOf('<table className="min-w-full divide-y divide-slate-200 text-sm">');
    const formTableEnd = listPage.indexOf('</table>', formTableStart);
    assert.ok(formTableStart >= 0 && formTableEnd > formTableStart);
    const formTable = listPage.slice(formTableStart, formTableEnd);
    assert.match(formTable, /branchOnlyView && !branchSalesManagerView[\s\S]*productSearch\.sku/);
    assert.match(formTable, /line\.quantity/);
    assert.match(formTable, /lineTotal\(line\)/);
    assert.match(formTable, /formatBranchPrice\(line, t\)/);
  });
});
