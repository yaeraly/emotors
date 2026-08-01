import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isRouteActive, resolveActiveRouteHref } from './nav-matching';
import { hqSalesBranchOrdersSubNavSections } from './scm-hub-sections';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const navHrefs = hqSalesBranchOrdersSubNavSections.map((section) => section.href);

assertEqual(
  isRouteActive('/branch-purchase-requests', '/branch-purchase-requests', ''),
  true,
  'branch orders tab active on list route',
);
assertEqual(
  resolveActiveRouteHref('/branch-purchase-requests', '', navHrefs),
  '/branch-purchase-requests',
  'branch orders tab resolved on list route',
);
assertEqual(
  resolveActiveRouteHref('/distribution/orders', '', navHrefs),
  '/distribution/orders',
  'shipment orders tab resolved on shipment route',
);

const section = readFileSync(join(__dirname, '../components/HqSalesBranchOrdersSection.tsx'), 'utf8');
assertEqual(section.includes('operations.hqBranchRequests'), true, 'section title key present');
assertEqual(section.includes('operations.hqBranchOrdersIntro'), true, 'section description key present');
assertEqual(section.includes('HqSalesBranchOrdersNav'), true, 'section renders navigation below header');

const listPage = readFileSync(join(__dirname, '../app/branch-purchase-requests/page.tsx'), 'utf8');
assertEqual(listPage.includes('HqSalesListFilterGrid'), true, 'branch orders list uses shared filter grid');
assertEqual(listPage.includes('HqSalesListTableCard'), true, 'branch orders list uses shared table card');
assertEqual(
  listPage.indexOf('HqSalesListFilterGrid') < listPage.indexOf('HqSalesListTableCard'),
  true,
  'filters appear before table in source',
);
assertEqual(listPage.includes('hqSalesView && !showForm'), true, 'hq sales filters hidden while creating order');

const shipmentPage = readFileSync(join(__dirname, '../app/distribution/orders/page.tsx'), 'utf8');
assertEqual(shipmentPage.includes('HqSalesListFilterGrid'), true, 'shipment orders uses shared filter grid');
assertEqual(shipmentPage.includes('HqSalesListTableCard'), true, 'shipment orders uses shared table card');

const layout = readFileSync(join(__dirname, '../components/HqSalesListLayout.tsx'), 'utf8');
assertEqual(layout.includes('h-[calc(100vh-300px)]'), true, 'shared table card scroll height matches reference');
assertEqual(layout.includes('rounded-3xl border border-slate-200 bg-white p-5 shadow-sm'), true, 'shared filter card styling');

console.log('hq-sales-list-layout.test.ts passed');
