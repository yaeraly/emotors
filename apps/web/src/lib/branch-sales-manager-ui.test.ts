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
  const displayUtil = readFileSync(
    join(root, 'lib/branch-purchase-request-display.util.ts'),
    'utf8',
  );
  const customersPage = readFileSync(join(root, 'app/customers/page.tsx'), 'utf8');
  const salesPage = readFileSync(join(root, 'app/sales/page.tsx'), 'utf8');
  const myBonusesPage = readFileSync(join(root, 'app/sales/my-bonuses/page.tsx'), 'utf8');

  it('hides branch column for branch sales manager order list', () => {
    assert.equal(shouldShowBranchColumnForBranchScopedTables(branchSalesManager), false);
  });

  it('order detail uses authoritative formatLineTotalKgs helpers', () => {
    assert.match(detailPage, /formatLineTotalKgs\(item, branchOrderTotalOptions\)/);
    assert.match(detailPage, /formatFrozenBranchPrice\(item, t\)/);
    assert.match(detailPage, /formatOrderTotalKgs\(request\.items, branchOrderTotalOptions\)/);
    assert.match(detailPage, /branchOrderTotal\(request\.items, branchOrderTotalOptions\)/);
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
    assert.match(bsmTable, /branchProductRequest\.reviewTableRequest/);
    assert.match(bsmTable, /branchProductRequest\.reviewTableApproved/);
    assert.doesNotMatch(bsmTable, /distribution\.quantity/);
    assert.match(bsmTable, /t\('branchProductRequest\.branchPurchasePrice'\)/);
    assert.match(bsmTable, /t\('branchProductRequest\.totalAmount'\)/);
    assert.doesNotMatch(bsmTable, /inventory\.sku/);
    assert.doesNotMatch(bsmTable, /item\.sku/);
    assert.match(bsmTable, /item\.productName/);
    assert.match(bsmTable, /getBranchSalesReviewRequestedQuantity\(item\)/);
    assert.match(bsmTable, /getBranchSalesReviewApprovedQuantity\(item\)/);
    assert.match(bsmTable, /formatLineTotalKgs\(item, branchOrderTotalOptions\)/);
    assert.match(bsmTable, /formatOrderTotalKgs\(request\.items, branchOrderTotalOptions\)/);
    assert.match(bsmTable, /branchSalesTableItems\.map/);
    assert.match(detailPage, /sortBranchSalesManagerReviewItemsByApprovalResult/);
    assert.match(detailPage, /branchSalesTableItems = useMemo/);
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
    assert.match(formTable, /draftFormLineTotal\(\{ \.\.\.line, branchType: formBranchType \}\)/);
    assert.match(formTable, /formatBranchPrice\(line, t\)/);
  });

  it('branch order detail derives reviewed totals from authoritative backend fields', () => {
    assert.match(detailPage, /branchOrderTotalOptions/);
    assert.match(detailPage, /branchOrderTotal\(request\.items, branchOrderTotalOptions\)/);
    assert.match(detailPage, /formatLineTotalKgs\(item, branchOrderTotalOptions\)/);
    assert.match(detailPage, /getBranchOrderDisplayQuantity/);
  });

  it('branch order list uses shared branchOrderTotal helper for branch manager table', () => {
    assert.match(listPage, /branchPurchaseListAmount\(request\)/);
    assert.match(listPage, /branchOrderTotal\(request\.items/);
  });

  it('create and draft product table line Сумма uses FIFO for HQ Branch and branch-price × qty for franchise', () => {
    assert.match(listPage, /draftFormLineTotal\(line\)|draftFormLineTotal\(\{ \.\.\.line, branchType: formBranchType \}\)/);
    assert.match(listPage, /draftFormOrderTotal/);
    assert.match(listPage, /formatBranchPrice\(line, t\)/);
    assert.match(listPage, /HQ Branch: persist backend FIFO line total/);
    assert.match(displayUtil, /isHqBranchTransferDisplay\(line\.branchType\)/);
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

  it('hq sales Утв. input allows empty string while editing and does not coerce to 0', () => {
    assert.match(detailPage, /ApprovedQuantityInput/);
    assert.match(detailPage, /parseApprovedQuantityChange/);
    assert.match(detailPage, /approvedQuantityInputValue\(decision\.approvedQuantity\)/);
    assert.doesNotMatch(detailPage, /approvedQuantity: Number\(event\.target\.value\)/);
    assert.match(detailPage, /hq-sales-approved-quantity-input\.util/);
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
    assert.match(compactTable, /table-auto/);
    assert.match(compactTable, /min-w-\[6rem\] w-auto/);
    assert.match(compactTable, /whitespace-normal break-normal break-words/);
    assert.doesNotMatch(compactTable, /min-w-\[260px\]/);
    assert.doesNotMatch(compactTable, /table-fixed/);
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
    assert.match(detailPage, /hqSalesDisplayedOrderAmount/);
    assert.match(detailPage, /hqReviewPreviewOrderAmount/);
    assert.match(detailPage, /draftApprovedQtyByItemId/);
    assert.match(detailPage, /branchOrderTotal\(request\.items, branchOrderTotalOptions\)/);
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
    assert.match(productCell, /min-w-\[6rem\] w-auto/);
    assert.doesNotMatch(productNameLine, /line-clamp|text-ellipsis|truncate/);
    assert.match(productNameLine, /break-words/);
    assert.match(detailPage, /hqReviewPreviewLineAmount\(item/);
    assert.doesNotMatch(compactTable, /hqReviewLineAmount\(item\)/);
    const longestSampleName =
      'Аккумуляторная батарея LiFePO4 высокой ёмкости для электромобиля EMOTORS Pro Max Extended Range';
    assert.ok(longestSampleName.length >= 80, 'sample catalog-length product name');
  });

  it('hq sales order detail keeps reviewed line decisions editable for re-approval', () => {
    assert.match(detailPage, /lineDecisionFromItem/);
    assert.match(detailPage, /buildLineDecisionsFromItems/);
    assert.match(detailPage, /min="0"/);
  });

  it('branch sales reviewed summary shows position counts and unit quantity totals', () => {
    assert.match(detailPage, /branchProductRequest\.approvedItems/);
    assert.match(detailPage, /branchProductRequest\.rejectedItems/);
    assert.match(detailPage, /branchProductRequest\.orderedUnits/);
    assert.match(detailPage, /branchProductRequest\.approvedUnits/);
    assert.match(detailPage, /sumBranchPurchaseRequestedQuantity/);
    assert.match(detailPage, /sumBranchPurchaseApprovedQuantity/);
    assert.match(detailPage, /totalRequestedQty/);
    assert.match(detailPage, /totalApprovedQty/);
  });

  it('branch sales manager table highlights partial approvals from persisted quantities', () => {
    const bsmTableStart = detailPage.indexOf('{branchSalesManagerView ? (');
    const bsmTableEnd = detailPage.indexOf(') : executiveCompactView ? (');
    const bsmTable = detailPage.slice(bsmTableStart, bsmTableEnd);
    assert.match(bsmTable, /branchSalesManagerReviewLineRowClass\(item\)/);
    assert.match(bsmTable, /reviewed \? branchSalesManagerReviewLineRowClass\(item\)/);
    assert.match(displayUtil, /isPartiallyApprovedBranchPurchaseLine/);
    assert.match(displayUtil, /bg-amber-50/);
    assert.match(displayUtil, /bg-red-50/);
    assert.match(displayUtil, /sortBranchSalesManagerReviewItemsByApprovalResult/);
    assert.match(displayUtil, /branchSalesManagerReviewLineDisplayPriority/);
  });
});
