import { readFileSync } from 'fs';
import { join } from 'path';
import type { User } from './types';
import {
  canAccessPath,
  getDefaultRouteForUser,
  isBranchMasterForbiddenPath,
  isBranchMasterInventoryForbiddenPath,
  isBranchMasterUser,
  isBranchWarehouseOperator,
} from './rbac';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchMaster = {
  id: 'master-1',
  email: 'master@test.com',
  fullName: 'Branch Master',
  role: 'MASTER' as const,
  roles: ['MASTER' as const],
  branchId: 'branch-1',
  permissions: ['service.manage', 'kpi.view', 'products.view'],
} satisfies User;

const branchWarehouseOperator = {
  id: 'bwo-1',
  email: 'warehouse@test.com',
  fullName: 'Branch Warehouse Operator',
  role: 'WAREHOUSE_OPERATOR' as const,
  roles: ['WAREHOUSE_OPERATOR' as const],
  branchId: 'branch-1',
  permissions: ['inventory.manage', 'distribution.manage'],
} satisfies User;

const branchOwner = {
  id: 'ceo-1',
  email: 'ceo@test.com',
  fullName: 'Branch CEO',
  role: 'FRANCHISE_OWNER' as const,
  roles: ['FRANCHISE_OWNER' as const],
  branchId: 'branch-1',
  permissions: ['inventory.manage', 'inventory.view', 'service.manage', 'crm.manage', 'sales.manage'],
} satisfies User;

const hqWarehouseManager = {
  id: 'hq-wm-1',
  email: 'hq-wm@test.com',
  fullName: 'HQ Warehouse Manager',
  role: 'WAREHOUSE_MANAGER' as const,
  roles: ['WAREHOUSE_MANAGER' as const],
  branchId: null,
  permissions: ['inventory.manage', 'inventory.view', 'distribution.manage'],
} satisfies User;

assertEqual(isBranchMasterUser(branchMaster), true, 'branch master detected');
assertEqual(isBranchMasterUser(branchWarehouseOperator), false, 'warehouse operator is not branch master');

const shell = readFileSync(join(__dirname, '../components/ProtectedShell.tsx'), 'utf8');
const masterSidebar = shell.slice(shell.indexOf('branchMasterView ?'), shell.indexOf(') : branchSalesManagerView ?'));

assertEqual(masterSidebar.includes("t('nav.inventory')"), false, 'branch master sidebar has no Склад label');
assertEqual(masterSidebar.includes('/inventory'), false, 'branch master sidebar has no inventory route');
assertEqual(masterSidebar.includes("t('service.title')"), true, 'branch master sidebar keeps service');
assertEqual(masterSidebar.includes('/service/kpi'), true, 'branch master sidebar keeps KPI');

assertEqual(canAccessPath(branchMaster, '/inventory'), false, 'branch master cannot open inventory');
assertEqual(canAccessPath(branchMaster, '/warehouses'), false, 'branch master cannot open warehouses');
assertEqual(canAccessPath(branchMaster, '/service'), true, 'branch master can open service');
assertEqual(canAccessPath(branchMaster, '/service/abc'), true, 'branch master can open service order');
assertEqual(canAccessPath(branchMaster, '/service/parts-requests'), true, 'branch master can open parts requests');
assertEqual(canAccessPath(branchMaster, '/service/kpi'), true, 'branch master can open service kpi');

assertEqual(isBranchMasterInventoryForbiddenPath('/inventory'), true, 'inventory path flagged');
assertEqual(isBranchMasterForbiddenPath('/products'), true, 'products path blocked for branch master');
assertEqual(getDefaultRouteForUser(branchMaster), '/service', 'branch master default route is service');

assertEqual(canAccessPath(branchWarehouseOperator, '/branch-warehouse/warehouse'), true, 'branch warehouse operator keeps warehouse');
assertEqual(canAccessPath(branchOwner, '/branch-ceo/warehouse'), true, 'branch ceo keeps warehouse');
assertEqual(canAccessPath(hqWarehouseManager, '/hq-warehouses'), true, 'hq warehouse manager unaffected');

assertEqual(shell.includes("redirectTo: '/service'"), true, 'inventory redirect to service exists');
assertEqual(shell.includes('isBranchMasterInventoryForbiddenPath'), true, 'protected shell checks inventory redirect');

const servicePage = readFileSync(join(__dirname, '../app/service/page.tsx'), 'utf8');
const serviceKpiPage = readFileSync(join(__dirname, '../app/service/kpi/page.tsx'), 'utf8');

assertEqual(
  servicePage.includes('shouldHideBranchMasterDuplicateNavTitle'),
  true,
  'service page hides duplicate title for branch master',
);
assertEqual(
  serviceKpiPage.includes('shouldHideBranchMasterDuplicateNavTitle'),
  true,
  'service kpi page hides duplicate service subtitle for branch master',
);
assertEqual(
  serviceKpiPage.includes('hideServiceSubtitle'),
  true,
  'service kpi page guards service subtitle',
);

console.log('branch-master-nav.test.ts passed');
