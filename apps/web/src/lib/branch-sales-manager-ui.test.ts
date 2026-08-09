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

  it('order detail uses authoritative formatLineTotalKgs helpers', () => {
    assert.match(detailPage, /formatLineTotalKgs\(item\)/);
    assert.match(detailPage, /formatFrozenBranchPrice\(item, t\)/);
    assert.match(detailPage, /formatOrderTotalKgs\(request\.items\)/);
    // Totals come from formatLineTotalKgs (prefers backend totalAmount), not raw formatKgs.
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
    assert.match(formTable, /draftFormLineTotal\(line\)/);
    assert.match(formTable, /formatBranchPrice\(line, t\)/);
  });

  it('create and draft product table derives totals from quantity times branch price', () => {
    assert.match(listPage, /draftFormLineTotal\(line\)/);
    assert.match(listPage, /draftFormOrderTotal\(lines\)/);
    assert.match(listPage, /authoritativeLineTotalKgs/);
    assert.match(listPage, /line\.authoritativeLineTotalKgs/);
  });

  it('create order form hides branch and branch warehouse selectors for branch sales manager', () => {
    assert.match(listPage, /!branchSalesManagerView \? \(/);
    assert.match(listPage, /activeFormBranchId/);
    assert.match(listPage, /resolveFormBranchContext/);
    assert.match(listPage, /branchId=\{activeFormBranchId\}/);
    assert.match(listPage, /branchProductRequest\.branchWarehouse/);
  });

  it('branch sales manager create payload omits user-selected branch fields', () => {
    assert.match(listPage, /if \(isBranchSalesManagerUser\(user\)\) \{\s*return payload;\s*\}/);
    assert.match(listPage, /branchId: form\.branchId/);
    assert.match(listPage, /branchWarehouseId: form\.branchWarehouseId/);
  });

  it('hq sales order detail uses quantity-driven approve without partial button', () => {
    assert.match(detailPage, /validateApprovedQuantityForApprove/);
    assert.match(detailPage, /action: 'APPROVE'/);
    assert.doesNotMatch(detailPage, /setLineAction\(item, 'PARTIAL'\)/);
    assert.doesNotMatch(detailPage, /actionPartialShort/);
    assert.doesNotMatch(detailPage, /actionPartial'\)/);
    assert.match(detailPage, /max=\{item\.quantity\}/);
  });

  it('hq sales compact product table highlights approved rows from persisted lineStatus', () => {
    assert.match(detailPage, /hqSalesReviewLineRowClass\(item\.lineStatus\)/);
    assert.match(detailPage, /isReviewedApprovedLineStatus/);
    assert.match(detailPage, /PARTIALLY_APPROVED/);
    assert.match(detailPage, /bg-green-50/);
    assert.match(detailPage, /hqSalesReviewLineStickyCellClass\(item\.lineStatus\)/);
    assert.doesNotMatch(detailPage, /decision\.action === 'APPROVE'[\s\S]*bg-green-50/);
  });

  it('hq sales compact product table omits Доступ and uses required column order', () => {
    const compactTableStart = detailPage.indexOf('hqCompactTable && canSeeHqStock ? (');
    assert.ok(compactTableStart >= 0);
    const compactTableEnd = detailPage.indexOf(') : (', compactTableStart);
    assert.ok(compactTableEnd > compactTableStart);
    const compactTable = detailPage.slice(compactTableStart, compactTableEnd);
    assert.doesNotMatch(compactTable, /hqCompact\.available/);
    assert.match(compactTable, /table-fixed/);
    assert.match(compactTable, /min-w-\[260px\]/);
    assert.match(compactTable, /whitespace-normal break-normal \[overflow-wrap:anywhere\]/);
    assert.match(compactTable, /formatProductUnit\(item\.unit, language, t\)/);
    assert.doesNotMatch(compactTable, /line-clamp/);
    assert.doesNotMatch(compactTable, /max-w-\[8rem\] truncate/);
    const headerStart = compactTable.indexOf('<thead');
    const headerEnd = compactTable.indexOf('</thead>', headerStart);
    const header = compactTable.slice(headerStart, headerEnd);
    const columnKeys = [
      'hqCompact.product',
      'hqCompact.unit',
      'hqCompact.requested',
      'hqCompact.hqPhysicalStock',
      'hqCompact.pricingPolicy',
      'hqCompact.approved',
      'hqCompact.branchStock',
      'hqCompact.requestTotal',
      'hqCompact.actions',
    ];
    let lastIndex = -1;
    for (const key of columnKeys) {
      const index = header.indexOf(key);
      assert.ok(index >= 0, `missing ${key} in HQ compact table header`);
      assert.ok(index > lastIndex, `${key} is out of order in HQ compact table header`);
      lastIndex = index;
    }
  });

  it('hq sales order detail uses order amount label and hides branch info', () => {
    assert.match(detailPage, /!hqSalesView \? \([\s\S]*distribution\.branch/);
    assert.match(detailPage, /hqSalesView \? t\('branchProductRequest\.orderAmount'\)/);
    assert.match(detailPage, /formatKgs\(request\.totalEstimatedAmount\)/);
  });

  it('hq sales compact product table keeps full product names readable without truncation', () => {
    const compactTableStart = detailPage.indexOf('hqCompactTable && canSeeHqStock ? (');
    const compactTableEnd = detailPage.indexOf(') : (', compactTableStart);
    const compactTable = detailPage.slice(compactTableStart, compactTableEnd);
    const productCellStart = compactTable.indexOf('{item.productName}');
    const productCell = compactTable.slice(Math.max(0, productCellStart - 220), productCellStart + 20);
    const productNameLine = compactTable.slice(
      compactTable.lastIndexOf('<p className="whitespace-normal', productCellStart),
      productCellStart + 1,
    );
    assert.match(productCell, /min-w-\[260px\]/);
    assert.doesNotMatch(productNameLine, /line-clamp|text-ellipsis|truncate/);
    const longestSampleName =
      'Аккумуляторная батарея LiFePO4 высокой ёмкости для электромобиля EMOTORS Pro Max Extended Range';
    assert.ok(longestSampleName.length >= 80, 'sample catalog-length product name');
  });

  it('hq sales order detail keeps reviewed line decisions editable for re-approval', () => {
    assert.match(detailPage, /lineDecisionFromItem/);
    assert.match(detailPage, /buildLineDecisionsFromItems/);
    assert.match(detailPage, /min="0"/);
  });
});
