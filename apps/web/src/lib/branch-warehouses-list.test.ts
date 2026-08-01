import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildBranchWarehousesListQuery,
  branchWarehousesListHref,
  EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS,
  parseBranchWarehousesListFilters,
} from './branch-warehouses-list';
import { filterWarehouseRows } from './warehouse-list-utils';

const toolbar = readFileSync(
  join(__dirname, '../components/warehouse/WarehouseListToolbar.tsx'),
  'utf8',
);
const listPage = readFileSync(join(__dirname, '../app/branch-warehouses/page.tsx'), 'utf8');

assert.equal(toolbar.includes('branchWarehouse.filterBranch'), true, 'branch filter label in toolbar');
assert.equal(toolbar.includes('branchWarehouse.allBranches'), true, 'all branches default option');
const searchIdx = toolbar.indexOf('common.search');
const branchIdx = toolbar.indexOf('branchWarehouse.filterBranch');
const regionIdx = toolbar.indexOf('warehouse.region');
assert.equal(searchIdx < branchIdx && branchIdx < regionIdx, true, 'filter order: search → branch → region');

assert.equal(listPage.includes('WarehouseListToolbar'), true, 'list page uses shared toolbar');
assert.equal(listPage.includes('onBranchChange'), true, 'list page wires branch filter');
assert.equal(listPage.includes('branchId'), true, 'list page uses branchId query param');
assert.equal(listPage.includes('onClear'), true, 'list page supports clear filters');

const parsed = parseBranchWarehousesListFilters(
  new URLSearchParams('search=wh-1&branchId=br-1&region=Kyrgyzstan&city=Bishkek&status=active&page=2'),
);
assert.equal(parsed.search, 'wh-1');
assert.equal(parsed.branchId, 'br-1');
assert.equal(parsed.region, 'Kyrgyzstan');
assert.equal(parsed.city, 'Bishkek');
assert.equal(parsed.status, 'active');
assert.equal(parsed.page, 2);

assert.equal(
  buildBranchWarehousesListQuery({ ...EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS, branchId: 'br-1' }),
  '?branchId=br-1',
);
assert.equal(
  branchWarehousesListHref({ ...EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS, branchId: 'br-1', page: 1 }),
  '/branch-warehouses?branchId=br-1',
);

const warehouses = [
  {
    name: 'WH A',
    code: 'WH-A',
    city: 'Bishkek',
    country: 'Kyrgyzstan',
    branchName: 'Branch A',
    branchId: 'br-a',
    isActive: true,
  },
  {
    name: 'WH B',
    code: 'WH-B',
    city: 'Osh',
    country: 'Kyrgyzstan',
    branchName: 'Branch B',
    branchId: 'br-b',
    isActive: true,
  },
];

const scoped = warehouses.filter((row) => row.branchId === 'br-a');
const filtered = filterWarehouseRows(scoped, {
  search: '',
  region: 'Kyrgyzstan',
  city: 'Bishkek',
  status: 'active',
});
assert.equal(filtered.length, 1);
assert.equal(filtered[0]?.name, 'WH A');

console.log('branch-warehouses-list.test.ts passed');
