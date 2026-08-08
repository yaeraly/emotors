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
    assert.match(detailPage, /requestLineTotal\(item\)/);
    assert.match(detailPage, /formatFrozenBranchPrice\(item, t\)/);
    assert.match(detailPage, /requestOrderTotal\(request\.items, request\.totalEstimatedAmount\)/);
    assert.doesNotMatch(detailPage, /formatKgs\(item\.totalAmount\)/);
  });

  it('order detail branch sales manager table has no sku column', () => {
    assert.match(detailPage, /branchSalesManagerView && !reviewed/);
    assert.match(detailPage, /!branchSalesManagerView \? \(/);
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
});
