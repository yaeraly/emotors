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

assertEqual(navHrefs.length, 5, 'five HQ Sales branch orders tabs');

for (const href of navHrefs) {
  assertEqual(
    resolveActiveRouteHref(href, '', navHrefs),
    href,
    `active tab resolves for ${href}`,
  );
}

assertEqual(
  isRouteActive('/branch-purchase-requests', '/branch-purchase-requests', ''),
  true,
  'branch orders tab active on list route',
);
assertEqual(
  resolveActiveRouteHref('/distribution/invoices', '', navHrefs),
  '/distribution/invoices',
  'invoices tab resolved',
);
assertEqual(
  resolveActiveRouteHref('/distribution/receivings', '', navHrefs),
  '/distribution/receivings',
  'receivings tab resolved',
);
assertEqual(
  resolveActiveRouteHref('/distribution/shortage-reports', '', navHrefs),
  '/distribution/shortage-reports',
  'shortage reports tab resolved',
);

const section = readFileSync(join(__dirname, '../components/HqSalesBranchOrdersSection.tsx'), 'utf8');
assertEqual(section.includes('operations.hqBranchRequests'), true, 'section title key present');
assertEqual(section.includes('operations.hqBranchOrdersIntro'), true, 'section description key present');
assertEqual(section.includes('HqSalesBranchOrdersNav'), true, 'section renders navigation below header');

const nav = readFileSync(join(__dirname, '../components/HqSalesBranchOrdersNav.tsx'), 'utf8');
assertEqual(nav.includes('ModuleSectionNav'), true, 'tabs use shared ModuleSectionNav');
assertEqual(nav.includes('variant="tabs"'), true, 'tabs variant matches reference');

const tabPages = [
  '../app/branch-purchase-requests/page.tsx',
  '../app/distribution/orders/page.tsx',
  '../app/distribution/invoices/page.tsx',
  '../app/distribution/receivings/page.tsx',
  '../app/distribution/shortage-reports/page.tsx',
];

for (const relativePath of tabPages) {
  const source = readFileSync(join(__dirname, relativePath), 'utf8');
  assertEqual(source.includes('HqSalesBranchOrdersSection'), true, `${relativePath} uses section shell`);
  assertEqual(source.includes('HqSalesListTableCard'), true, `${relativePath} uses shared table card`);
}

const invoicesPage = readFileSync(join(__dirname, '../app/distribution/invoices/page.tsx'), 'utf8');
assertEqual(invoicesPage.includes('HqSalesListFilterGrid'), true, 'invoices tab uses shared filter grid');
assertEqual(invoicesPage.includes('HqSalesBranchOrdersTabContent'), true, 'invoices tab uses tab content wrapper');

const receivingsPage = readFileSync(join(__dirname, '../app/distribution/receivings/page.tsx'), 'utf8');
assertEqual(receivingsPage.includes('HqSalesBranchOrdersTabContent'), true, 'receivings tab uses tab content wrapper');
assertEqual(receivingsPage.includes('HqSalesListFilterGrid'), false, 'receivings tab has no filters added');

const branchPage = readFileSync(join(__dirname, '../app/branch-purchase-requests/page.tsx'), 'utf8');
assertEqual(branchPage.includes('HqSalesBranchOrdersTabContent'), true, 'branch orders tab uses tab content wrapper');
assertEqual(branchPage.includes('onClear'), true, 'branch orders tab supports filter clear');
assertEqual(
  branchPage.includes("operations.hqBranchOrdersTable.requester"),
  false,
  'HQ Sales branch orders table omits requester column',
);
assertEqual(
  branchPage.includes("operations.hqBranchOrdersTable.hqWarehouse"),
  false,
  'HQ Sales branch orders table omits HQ warehouse column',
);

const layout = readFileSync(join(__dirname, '../components/HqSalesListLayout.tsx'), 'utf8');
assertEqual(layout.includes('HqSalesBranchOrdersTabContent'), true, 'tab content helper exists');
assertEqual(layout.includes('HqSalesListLoadingState'), true, 'shared loading state exists');
assertEqual(layout.includes('HqSalesListEmptyState'), true, 'shared empty state exists');
assertEqual(layout.includes('onClear'), true, 'filter grid supports clear action');
assertEqual(layout.includes('overflow-x-auto'), true, 'shared table card horizontal scroll');

console.log('hq-sales-list-layout.test.ts passed');
