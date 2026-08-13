import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = join(__dirname, '../../../..');
const apiRoot = join(repoRoot, 'apps/api');
const webRoot = join(repoRoot, 'apps/web');

function readRepoFile(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('obsolete APPROVED_BY_CUSTOMER sale status removal', () => {
  it('Prisma schema no longer defines APPROVED_BY_CUSTOMER', () => {
    const schema = readRepoFile('apps/api/prisma/schema.prisma');
    assert.doesNotMatch(schema, /APPROVED_BY_CUSTOMER/);
    assert.match(schema, /enum SaleStatus[\s\S]*?WAITING_FOR_CASHIER_PAYMENT/);
  });

  it('migration remaps historical APPROVED_BY_CUSTOMER rows before enum recreation', () => {
    const migration = readRepoFile(
      'apps/api/prisma/migrations/20260803150000_remove_sale_approved_by_customer_status/migration.sql',
    );
    assert.match(migration, /WHERE s\.status = 'APPROVED_BY_CUSTOMER'/);
    assert.match(migration, /'FINALIZED'/);
    assert.match(migration, /'WAITING_FOR_CASHIER_PAYMENT'/);
    assert.match(migration, /'SENT_TO_CUSTOMER'/);
    assert.match(migration, /sia\.status IN \('APPROVED', 'ACTIVE', 'PAID'\)/);
    assert.match(migration, /CREATE TYPE "SaleStatus_new"/);
    assert.doesNotMatch(migration, /APPROVED_BY_CUSTOMER.*SaleStatus_new/);
  });

  it('sales controller no longer exposes POST /sales/:id/approve', () => {
    const controller = readFileSync(join(apiRoot, 'src/sales/sales.controller.ts'), 'utf8');
    assert.doesNotMatch(controller, /Post\(':id\/approve'\)/);
    assert.doesNotMatch(controller, /\bapprove\(@CurrentUser\(\) user: AuthUser, @Param\('id'\) id: string\)/);
  });

  it('sales service no longer sets APPROVED_BY_CUSTOMER', () => {
    const service = readFileSync(join(apiRoot, 'src/sales/sales.service.ts'), 'utf8');
    assert.doesNotMatch(service, /APPROVED_BY_CUSTOMER/);
    assert.doesNotMatch(service, /async approve\(/);
  });

  it('branch sales workflow constants exclude APPROVED_BY_CUSTOMER', () => {
    const workflow = readFileSync(join(apiRoot, 'src/sales/branch-sales-workflow.util.ts'), 'utf8');
    const lifecycle = readFileSync(
      join(apiRoot, 'src/lifecycle/hq-ceo-lifecycle.constants.ts'),
      'utf8',
    );
    assert.doesNotMatch(workflow, /APPROVED_BY_CUSTOMER/);
    assert.doesNotMatch(lifecycle, /APPROVED_BY_CUSTOMER/);
  });

  it('frontend types and translations exclude APPROVED_BY_CUSTOMER', () => {
    const types = readFileSync(join(webRoot, 'src/lib/types.ts'), 'utf8');
    const statusTranslations = readFileSync(
      join(webRoot, 'src/i18n/status-translations.ts'),
      'utf8',
    );
    const rbac = readFileSync(join(webRoot, 'src/lib/rbac.ts'), 'utf8');
    assert.doesNotMatch(types, /APPROVED_BY_CUSTOMER/);
    assert.doesNotMatch(statusTranslations, /APPROVED_BY_CUSTOMER/);
    assert.doesNotMatch(statusTranslations, /Одобрено клиентом/);
    assert.doesNotMatch(rbac, /export function canApproveSale\b/);
  });
});
