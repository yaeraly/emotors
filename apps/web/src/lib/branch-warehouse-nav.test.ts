import { readFileSync } from 'fs';
import { join } from 'path';
import type { User } from './types';
import {
  BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT,
  canAccessPath,
  isBranchWarehouseOperatorRequestsForbiddenPath,
} from './rbac';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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
  permissions: ['inventory.manage', 'inventory.view', 'sales.manage'],
} satisfies User;

const shell = readFileSync(join(__dirname, '../components/ProtectedShell.tsx'), 'utf8');
const warehouseSidebar = shell.slice(
  shell.indexOf('branchWarehouseOperatorView ?'),
  shell.indexOf(') : branchAccountantView ?'),
);

assertEqual(
  warehouseSidebar.includes("t('branchWarehouseOperator.requests')"),
  false,
  'branch warehouse sidebar has no Заявки label',
);
assertEqual(
  warehouseSidebar.includes('/branch-warehouse/requests'),
  false,
  'branch warehouse sidebar has no requests route',
);
assertEqual(
  warehouseSidebar.includes("t('distribution.receiveGoods')"),
  true,
  'branch warehouse sidebar keeps receive goods',
);
assertEqual(
  warehouseSidebar.includes("t('branchWarehouseOperator.warehouse')"),
  true,
  'branch warehouse sidebar keeps warehouse',
);
assertEqual(
  warehouseSidebar.includes("t('distribution.shortageReports')"),
  true,
  'branch warehouse sidebar keeps shortage reports',
);
assertEqual(
  shell.includes('isBranchWarehouseOperatorRequestsForbiddenPath'),
  true,
  'protected shell checks requests redirect',
);

assertEqual(
  isBranchWarehouseOperatorRequestsForbiddenPath('/branch-warehouse/requests'),
  true,
  'requests list path blocked',
);
assertEqual(
  isBranchWarehouseOperatorRequestsForbiddenPath('/branch-warehouse/requests/abc'),
  true,
  'requests detail path blocked',
);
assertEqual(
  isBranchWarehouseOperatorRequestsForbiddenPath('/branch-warehouse/warehouse'),
  false,
  'warehouse path allowed',
);
assertEqual(
  canAccessPath(branchWarehouseOperator, '/branch-warehouse/requests'),
  false,
  'branch warehouse cannot access requests list',
);
assertEqual(
  canAccessPath(branchWarehouseOperator, '/distribution/orders'),
  true,
  'branch warehouse can access incoming shipments',
);
assertEqual(
  canAccessPath(branchWarehouseOperator, '/branch-warehouse/warehouse/inventory'),
  true,
  'branch warehouse can access inventory',
);
assertEqual(
  canAccessPath(branchOwner, '/branch-purchase-requests'),
  true,
  'branch ceo keeps branch purchase requests',
);
assertEqual(
  BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT,
  '/distribution/orders?status=SHIPPED',
  'requests redirect targets receive goods',
);

const warehousePage = readFileSync(join(__dirname, '../app/branch-warehouse/warehouse/page.tsx'), 'utf8');
const ordersPage = readFileSync(join(__dirname, '../app/distribution/orders/page.tsx'), 'utf8');
const shortageReportsPage = readFileSync(join(__dirname, '../app/distribution/shortage-reports/page.tsx'), 'utf8');

assertEqual(warehousePage.includes('showHeading={false}'), true, 'warehouse page hides duplicate heading');
assertEqual(
  ordersPage.includes('!operatorView ?') && ordersPage.includes('distributionModuleTitleKey(currentUser)'),
  true,
  'receive goods page hides distribution module subtitle for operator',
);
assertEqual(
  shortageReportsPage.includes('isBranchWarehouseOperator') && shortageReportsPage.includes('!operatorView ?'),
  true,
  'shortage reports page hides distribution module subtitle for operator',
);

console.log('branch-warehouse-nav.test.ts: all assertions passed');
