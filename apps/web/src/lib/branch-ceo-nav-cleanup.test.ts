import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import type { User } from './types';
import { shouldHideBranchCeoDuplicateNavTitle } from './unified-nav-page-title';

const branchOwner = {
  id: 'ceo-1',
  email: 'ceo@test.com',
  fullName: 'Branch CEO',
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage', 'finance.view'],
} satisfies User;

const branchSalesManager = {
  id: 'bsm-1',
  email: 'bsm@test.com',
  fullName: 'Branch Sales Manager',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage'],
} satisfies User;

const hqManager = {
  id: 'hq-1',
  email: 'hq@test.com',
  fullName: 'HQ Manager',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: null,
  permissions: ['sales.manage'],
} satisfies User;

describe('shouldHideBranchCeoDuplicateNavTitle', () => {
  it('applies only to branch ceo', () => {
    assert.equal(shouldHideBranchCeoDuplicateNavTitle(branchOwner), true);
    assert.equal(shouldHideBranchCeoDuplicateNavTitle(branchSalesManager), false);
    assert.equal(shouldHideBranchCeoDuplicateNavTitle(hqManager), false);
  });
});

describe('branch ceo navigation cleanup ui', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const customersPage = readFileSync(join(root, 'app/customers/page.tsx'), 'utf8');
  const salesPage = readFileSync(join(root, 'app/sales/page.tsx'), 'utf8');
  const installmentRequestsPage = readFileSync(join(root, 'app/sales/installment-requests/page.tsx'), 'utf8');
  const productDirectoryList = readFileSync(
    join(root, 'components/branch-ceo/BranchProductDirectoryListContent.tsx'),
    'utf8',
  );
  const servicePage = readFileSync(join(root, 'app/service/page.tsx'), 'utf8');
  const warrantiesPage = readFileSync(join(root, 'app/service/warranties/page.tsx'), 'utf8');
  const serviceReportsPage = readFileSync(join(root, 'app/service/reports/page.tsx'), 'utf8');
  const partsRequestsPage = readFileSync(join(root, 'app/service/parts-requests/page.tsx'), 'utf8');
  const warehousePage = readFileSync(join(root, 'app/branch-ceo/warehouse/page.tsx'), 'utf8');
  const warehouseInventoryPage = readFileSync(join(root, 'app/branch-ceo/warehouse/inventory/page.tsx'), 'utf8');
  const financeLayout = readFileSync(join(root, 'components/finance/FinanceLayout.tsx'), 'utf8');
  const phase2Page = readFileSync(join(root, 'components/Phase2DataPage.tsx'), 'utf8');

  it('hides client history subtitle for branch ceo on customers pages', () => {
    assert.match(customersPage, /!branchOwnerView/);
    assert.match(customersPage, /crm\.customerHistory/);
  });

  it('hides duplicated sales headings for branch ceo', () => {
    assert.match(salesPage, /hideSalesDuplicateTitles/);
    assert.match(salesPage, /sales\.salesAndPayments/);
    assert.match(salesPage, /sales\.payments/);
  });

  it('hides installment request details heading for branch ceo', () => {
    assert.match(installmentRequestsPage, /hideInstallmentDetailHeading/);
    assert.match(installmentRequestsPage, /sales\.installmentRequestDetails/);
    assert.match(installmentRequestsPage, /sales\.approveInstallment/);
  });

  it('removes status column from branch ceo product directory table', () => {
    assert.doesNotMatch(productDirectoryList, /inventory\.status/);
    assert.match(productDirectoryList, /inventory\.weight/);
    assert.match(productDirectoryList, /common\.actions/);
  });

  it('hides duplicated service headings for branch ceo', () => {
    for (const source of [servicePage, warrantiesPage, serviceReportsPage, partsRequestsPage]) {
      assert.match(source, /shouldHideBranchCeoDuplicateNavTitle/);
      assert.match(source, /hideDuplicateTitle/);
    }
  });

  it('hides duplicated warehouse headings on branch ceo warehouse pages', () => {
    assert.match(warehousePage, /showHeading=\{false\}/);
    assert.match(warehouseInventoryPage, /showHeading=\{false\}/);
  });

  it('removes finance duplicate navigation for branch ceo', () => {
    assert.match(financeLayout, /hideFinanceDuplicateNav/);
    assert.match(financeLayout, /isBranchOwnerUser/);
    assert.match(financeLayout, /ModuleSectionNav sections=\{mainNav\}/);
    assert.match(phase2Page, /hideDuplicateTitle/);
  });
});
