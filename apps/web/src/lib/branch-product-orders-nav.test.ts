import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BRANCH_INCOMING_SHIPMENTS_HREF,
  BRANCH_PRODUCT_ORDERS_LIST_HREF,
  branchProductOrdersModuleForUser,
  usesBranchProductOrdersPageNav,
  visibleBranchProductOrdersNavSections,
} from './branch-product-orders-nav';
import { isRouteActive, resolveActiveRouteHref } from './nav-matching';
import { isUnifiedNavModuleActive } from './unified-nav';
import type { User } from './types';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchSalesManager = {
  id: 'bsm-1',
  email: 'bsm@test.com',
  fullName: 'Branch Sales Manager',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage', 'inventory.view'],
} satisfies User;

const module = branchProductOrdersModuleForUser(branchSalesManager);
assert.ok(module, 'branch sales manager has distribution module');

const navSections = visibleBranchProductOrdersNavSections(branchSalesManager);
assertEqual(navSections.length, 2, 'two section tabs for branch sales manager');
assertEqual(navSections[0]?.href, BRANCH_PRODUCT_ORDERS_LIST_HREF, 'first tab is branch requests');
assertEqual(navSections[0]?.labelKey, 'nav.distributionBranchRequests', 'branch requests label key');
assertEqual(navSections[1]?.href, BRANCH_INCOMING_SHIPMENTS_HREF, 'second tab is incoming shipments');
assertEqual(navSections[1]?.labelKey, 'branchManager.incomingShipments', 'incoming shipments label key');

assertEqual(
  usesBranchProductOrdersPageNav('/branch-purchase-requests', branchSalesManager),
  true,
  'list route uses page-level nav',
);
assertEqual(
  usesBranchProductOrdersPageNav('/branch-purchase-requests/abc', branchSalesManager),
  true,
  'detail route uses page-level nav',
);
assertEqual(
  usesBranchProductOrdersPageNav('/branch-manager/shipments', branchSalesManager),
  true,
  'incoming shipments uses page-level nav',
);
assertEqual(
  usesBranchProductOrdersPageNav('/sales', branchSalesManager),
  false,
  'sales route does not use branch product orders nav',
);

assertEqual(
  isRouteActive('/branch-purchase-requests', BRANCH_PRODUCT_ORDERS_LIST_HREF, ''),
  true,
  'branch requests tab active on list route',
);
assertEqual(
  isRouteActive('/branch-purchase-requests', BRANCH_PRODUCT_ORDERS_LIST_HREF, '?new=1'),
  true,
  'branch requests tab active when creating order',
);
assertEqual(
  isRouteActive('/branch-purchase-requests/req-1', BRANCH_PRODUCT_ORDERS_LIST_HREF, ''),
  true,
  'branch requests tab active on detail route',
);
assertEqual(
  isRouteActive('/branch-manager/shipments', BRANCH_INCOMING_SHIPMENTS_HREF, ''),
  true,
  'incoming shipments tab active on shipments route',
);
assertEqual(
  resolveActiveRouteHref('/branch-manager/shipments', '', navSections.map((s) => s.href)),
  BRANCH_INCOMING_SHIPMENTS_HREF,
  'incoming shipments tab resolved on shipments route',
);
assertEqual(
  resolveActiveRouteHref('/branch-purchase-requests', '?new=1', navSections.map((s) => s.href)),
  BRANCH_PRODUCT_ORDERS_LIST_HREF,
  'branch requests tab resolved when creating order',
);

assertEqual(
  isUnifiedNavModuleActive('/branch-purchase-requests', module!),
  true,
  'sidebar module active on list route',
);
assertEqual(
  isUnifiedNavModuleActive('/branch-manager/shipments', module!),
  true,
  'sidebar module active on incoming shipments route',
);

const listPage = readFileSync(
  join(__dirname, '../app/branch-purchase-requests/page.tsx'),
  'utf8',
);
assertEqual(listPage.includes('BranchProductOrdersSection'), true, 'list page uses BranchProductOrdersSection');
assertEqual(listPage.includes('BRANCH_PRODUCT_ORDERS_LIST_HREF'), true, 'list page uses list href constant');
assertEqual(listPage.includes('?new=1'), true, 'create order uses route query param');
assertEqual(listPage.includes('?draft='), true, 'draft edit uses route query param');
assert.equal(
  (listPage.match(/branch-purchase-requests\/page\.tsx/g) ?? []).length,
  0,
  'no duplicate branch-purchase-requests list pages created',
);

const shipmentsPage = readFileSync(join(__dirname, '../app/branch-manager/shipments/page.tsx'), 'utf8');
assertEqual(shipmentsPage.includes('BranchProductOrdersSection'), true, 'shipments page uses shared section shell');

const unifiedTopNav = readFileSync(join(__dirname, '../components/UnifiedModuleTopNav.tsx'), 'utf8');
assertEqual(
  unifiedTopNav.includes('usesBranchProductOrdersPageNav'),
  true,
  'global top nav skips branch product orders pages',
);

console.log('branch-product-orders-nav.test.ts passed');
