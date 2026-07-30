import assert from 'node:assert/strict';
import { Role, SaleStatus } from '@prisma/client';
import { canUpdateBusinessDate } from '../rbac/rbac';

/**
 * Integration-style test using mocked prisma delegates.
 * Verifies permission, range validation, audit metadata shape, and field-only update.
 */

type AuditRow = { action: string; metadata: Record<string, unknown> };

const audits: AuditRow[] = [];
const saleStore = {
  id: 'sale-1',
  branchId: 'branch-1',
  saleDate: new Date('2026-07-30T10:00:00.000Z'),
  createdAt: new Date('2026-07-30T10:00:00.000Z'),
  updatedAt: new Date('2026-07-30T10:00:00.000Z'),
  status: SaleStatus.FINALIZED,
  totalAmount: 1000,
  deletedAt: null,
};

const hqAdmin = {
  id: 'admin-1',
  role: Role.SYSTEM_ADMINISTRATOR,
  roles: [Role.SYSTEM_ADMINISTRATOR],
  permissions: ['businessDate.update.hqAdmin'],
  branchId: null,
};

async function run() {
  const { BusinessDateService } = await import('./business-date.service');

  const prismaMock = {
    sale: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === saleStore.id ? { ...saleStore } : null,
      update: async ({ data }: { data: { saleDate: Date } }) => {
        saleStore.saleDate = data.saleDate;
        saleStore.updatedAt = new Date();
        return { ...saleStore };
      },
    },
    $transaction: async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata: Record<string, unknown> } }) => {
        audits.push({ action: data.action, metadata: data.metadata });
        return data;
      },
    },
  };

  const service = new BusinessDateService(prismaMock as never);
  const now = new Date(2026, 6, 30);

  // Non-HQ admin rejected
  let forbidden = false;
  try {
    await service.updateBusinessDate(
      { ...hqAdmin, role: Role.CEO, roles: [Role.CEO], permissions: [] },
      {
        entityType: 'Sale',
        entityId: 'sale-1',
        fieldName: 'saleDate',
        newDate: '2026-04-15',
        reason: 'test',
      },
    );
  } catch {
    forbidden = true;
  }
  assert.equal(forbidden, true, '7. unauthorized user rejected');

  // Empty reason rejected
  let reasonRejected = false;
  try {
    await service.updateBusinessDate(hqAdmin as never, {
      entityType: 'Sale',
      entityId: 'sale-1',
      fieldName: 'saleDate',
      newDate: '2026-04-15',
      reason: '',
    });
  } catch {
    reasonRejected = true;
  }
  assert.equal(reasonRejected, true, '10. empty reason rejected');

  // Old date rejected
  let rangeRejected = false;
  try {
    await service.updateBusinessDate(hqAdmin as never, {
      entityType: 'Sale',
      entityId: 'sale-1',
      fieldName: 'saleDate',
      newDate: '2025-01-01',
      reason: 'too old',
    });
  } catch {
    rangeRejected = true;
  }
  assert.equal(rangeRejected, true, '8. date older than 5 months rejected');

  // Future rejected
  let futureRejected = false;
  try {
    await service.updateBusinessDate(hqAdmin as never, {
      entityType: 'Sale',
      entityId: 'sale-1',
      fieldName: 'saleDate',
      newDate: '2026-08-01',
      reason: 'future',
    });
  } catch {
    futureRejected = true;
  }
  assert.equal(futureRejected, true, '9. future date rejected');

  const originalCreatedAt = saleStore.createdAt.getTime();
  const originalStatus = saleStore.status;
  const originalAmount = saleStore.totalAmount;

  const result = await service.updateBusinessDate(hqAdmin as never, {
    entityType: 'Sale',
    entityId: 'sale-1',
    fieldName: 'saleDate',
    newDate: '2026-04-15',
    reason: 'historical correction',
  });

  assert.equal(canUpdateBusinessDate(hqAdmin as never), true, 'HQ Admin permission');
  assert.equal(saleStore.saleDate.toISOString().slice(0, 10), '2026-04-15', '1. sale date updated');
  assert.equal(saleStore.createdAt.getTime(), originalCreatedAt, '11. createdAt unchanged');
  assert.notEqual(saleStore.updatedAt.getTime(), originalCreatedAt, '12. updatedAt changed');
  assert.equal(saleStore.status, originalStatus, '13. status unchanged');
  assert.equal(saleStore.totalAmount, originalAmount, '14. amount unchanged');
  assert.equal(audits.length >= 1, true, '20. audit log created');
  assert.equal(audits[audits.length - 1].action, 'BUSINESS_DATE_CHANGED');
  assert.equal(audits[audits.length - 1].metadata.fieldName, 'saleDate');
  assert.ok(result);

  // Monthly report period move simulation
  const aprilStart = new Date(2026, 3, 1);
  const aprilEnd = new Date(2026, 3, 30, 23, 59, 59, 999);
  const inApril =
    saleStore.saleDate.getTime() >= aprilStart.getTime() &&
    saleStore.saleDate.getTime() <= aprilEnd.getTime();
  assert.equal(inApril, true, '17. sale moves to April report period');

  console.log('business-date.service.test.ts: all assertions passed');
}

void run();
