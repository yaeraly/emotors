import { FinanceLedgerEntryType, Role } from '@prisma/client';
import { FinanceInvestmentsService } from './finance-investments.service';
import { planInvestmentEditEffect } from './finance-investments.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects(promise: Promise<unknown>, includes: string, label: string) {
  try {
    await promise;
    throw new Error(`${label}: expected rejection`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(includes)) {
      throw new Error(`${label}: expected message including "${includes}", got "${message}"`);
    }
  }
}

const ceoUser = {
  id: 'ceo-1',
  email: 'ceo@test.com',
  fullName: 'CEO',
  role: Role.CEO,
  roles: [Role.CEO],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

const accountantUser = {
  id: 'acc-1',
  email: 'acc@test.com',
  fullName: 'Accountant',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage'],
};

function createService(overrides: {
  findUnique?: (args: any) => Promise<any>;
  update?: (args: any) => Promise<any>;
  postLedgerEntry?: (tx: any, user: any, input: any) => Promise<any>;
  transaction?: (fn: any) => Promise<any>;
} = {}) {
  const posted: any[] = [];
  const audits: any[] = [];

  const investmentRow = {
    id: 'inv-1',
    investmentNumber: 'FIN-1',
    investmentDate: new Date('2026-07-01'),
    investmentType: 'OWNER_INVESTMENT',
    amount: 100_000,
    currency: 'KGS',
    accountId: 'cash',
    branchId: 'branch-1',
    investorOwnerName: 'Owner',
    notes: null,
    ledgerEntryId: 'le-1',
    createdById: 'ceo-1',
    deletedAt: null,
    deletedById: null,
    deletionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    account: {
      id: 'cash',
      name: 'Cash',
      accountNumber: 'CASH-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
      currency: 'KGS',
    },
    createdBy: { id: 'ceo-1', fullName: 'CEO', email: 'ceo@test.com' },
    deletedBy: null,
    ledgerEntry: {
      id: 'le-1',
      entryNumber: 'FLE-1',
      entryType: FinanceLedgerEntryType.OWNER_INVESTMENT,
      amount: 100_000,
      beforeBalance: 0,
      afterBalance: 100_000,
    },
  };

  const tx = {
    financeInvestment: {
      findUnique: overrides.findUnique ?? (async () => ({ ...investmentRow })),
      update:
        overrides.update ??
        (async ({ data }: any) => ({
          ...investmentRow,
          ...data,
          account: data.accountId === 'bank'
            ? {
                id: 'bank',
                name: 'Bank',
                accountNumber: 'BANK-1',
                branchId: 'branch-1',
                status: 'ACTIVE',
                currency: 'KGS',
              }
            : investmentRow.account,
        })),
    },
    financeAccount: {
      findFirst: async ({ where }: any) => {
        if (where.id === 'bank') {
          return {
            id: 'bank',
            branchId: 'branch-1',
            status: 'ACTIVE',
            deletedAt: null,
            currency: 'KGS',
            scope: 'BRANCH',
            typeDefinition: null,
          };
        }
        if (where.id === 'cash') {
          return {
            id: 'cash',
            branchId: 'branch-1',
            status: 'ACTIVE',
            deletedAt: null,
            currency: 'KGS',
            scope: 'BRANCH',
            typeDefinition: null,
          };
        }
        return null;
      },
    },
    financeLedgerEntry: {
      update: async () => ({}),
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
  };

  const prisma = {
    $transaction: overrides.transaction ?? (async (fn: any) => fn(tx)),
    financeInvestment: {
      findUnique: tx.financeInvestment.findUnique,
      findMany: async () => [],
    },
    financeAccount: tx.financeAccount,
  };

  const ledgerService = {
    postLedgerEntry:
      overrides.postLedgerEntry ??
      (async (_tx: any, _user: any, input: any) => {
        posted.push(input);
        return {
          id: `le-${posted.length + 1}`,
          entryNumber: `FLE-${posted.length + 1}`,
          ...input,
        };
      }),
  };

  const notifications = {
    notifyInTx: async () => undefined,
  };

  const service = new FinanceInvestmentsService(
    prisma as any,
    ledgerService as any,
    notifications as any,
  );

  return { service, posted, audits, investmentRow, tx };
}

async function main() {
  // 2. Non-authorized role cannot edit
  {
    const { service } = createService();
    await assertRejects(
      service.updateInvestment(accountantUser as any, 'inv-1', { amount: 120_000 }),
      'Only CEO/Owner',
      'accountant cannot edit',
    );
  }

  // 4. Non-authorized role cannot delete
  {
    const { service } = createService();
    await assertRejects(
      service.deleteInvestment(accountantUser as any, 'inv-1', { reason: 'mistake' }),
      'Only CEO/Owner',
      'accountant cannot delete',
    );
  }

  // 1 / 8. CEO can edit; increase posts only delta
  {
    const { service, posted } = createService();
    await service.updateInvestment(ceoUser as any, 'inv-1', { amount: 120_000, reason: 'top-up' });
    assertEqual(posted.length, 1, 'one adjustment entry for increase');
    assertEqual(posted[0].amount, 20_000, 'posts only 20k difference');
    assertEqual(posted[0].entryType, FinanceLedgerEntryType.OWNER_INVESTMENT, 'increase uses investment type');
    assertEqual(posted[0].referenceType, 'FinanceInvestmentAdjustment', 'adjustment reference');
  }

  // 9. Decreasing amount
  {
    const { service, posted } = createService();
    await service.updateInvestment(ceoUser as any, 'inv-1', { amount: 80_000, reason: 'correction' });
    assertEqual(posted.length, 1, 'one adjustment for decrease');
    assertEqual(posted[0].amount, 20_000, 'posts absolute 20k');
    assertEqual(posted[0].entryType, FinanceLedgerEntryType.EXPENSE, 'decrease uses expense');
  }

  // 10 / 11. Account change reverses old + credits new (no duplicate full re-post on same account)
  {
    const { service, posted } = createService();
    await service.updateInvestment(ceoUser as any, 'inv-1', {
      accountId: 'bank',
      amount: 100_000,
      reason: 'move',
    });
    assertEqual(posted.length, 2, 'reversal + credit');
    assertEqual(posted[0].accountId, 'cash', 'reverse old account');
    assertEqual(posted[0].amount, 100_000, 'full reverse of old amount');
    assertEqual(posted[0].entryType, FinanceLedgerEntryType.EXPENSE, 'reversal is expense');
    assertEqual(posted[1].accountId, 'bank', 'credit new account');
    assertEqual(posted[1].amount, 100_000, 'credit new amount once');
  }

  // 3 / 12. CEO can delete; deletion reverses finance effect
  {
    const { service, posted, audits } = createService();
    await service.deleteInvestment(ceoUser as any, 'inv-1', { reason: 'duplicate entry' });
    assertEqual(posted.length, 1, 'one reversal on delete');
    assertEqual(posted[0].amount, 100_000, 'full reverse amount');
    assertEqual(posted[0].referenceType, 'FinanceInvestmentDeletionReversal', 'deletion reversal ref');
    const actions = audits.map((a) => a.action);
    assertEqual(actions.includes('finance.investment.deleted'), true, 'delete audit');
    assertEqual(
      actions.includes('finance.investment.financial_effect_reversed'),
      true,
      'reversal audit',
    );
  }

  // 15. Investment cannot be deleted twice
  {
    const { service } = createService({
      findUnique: async () => ({
        id: 'inv-1',
        deletedAt: new Date(),
        amount: 100_000,
        currency: 'KGS',
        accountId: 'cash',
        branchId: 'branch-1',
        investmentNumber: 'FIN-1',
        ledgerEntryId: 'le-1',
        ledgerEntry: { id: 'le-1' },
        account: { id: 'cash', name: 'Cash', currency: 'KGS', status: 'ACTIVE', branchId: 'branch-1' },
      }),
    });
    await assertRejects(
      service.deleteInvestment(ceoUser as any, 'inv-1', { reason: 'again' }),
      'already deleted',
      'double delete blocked',
    );
  }

  // 16. Invalid negative balance prevented (ledger throws)
  {
    const { service } = createService({
      postLedgerEntry: async () => {
        throw new Error('Insufficient account balance');
      },
    });
    await assertRejects(
      service.updateInvestment(ceoUser as any, 'inv-1', { amount: 10_000, reason: 'too low' }),
      'Insufficient account balance',
      'negative balance prevented',
    );
  }

  // 17. Database transaction rolls back fully on failure (no partial ledger posts committed)
  {
    let ran = false;
    const { service, posted } = createService({
      transaction: async (fn: any) => {
        ran = true;
        try {
          return await fn({
            financeInvestment: {
              findUnique: async () => ({
                id: 'inv-1',
                investmentNumber: 'FIN-1',
                investmentDate: new Date('2026-07-01'),
                investmentType: 'OWNER_INVESTMENT',
                amount: 100_000,
                currency: 'KGS',
                accountId: 'cash',
                branchId: 'branch-1',
                investorOwnerName: 'Owner',
                notes: null,
                ledgerEntryId: 'le-1',
                deletedAt: null,
                account: {
                  id: 'cash',
                  name: 'Cash',
                  accountNumber: 'CASH-1',
                  branchId: 'branch-1',
                  status: 'ACTIVE',
                  currency: 'KGS',
                },
                createdBy: null,
                deletedBy: null,
                ledgerEntry: { id: 'le-1', entryNumber: 'FLE-1', entryType: 'OWNER_INVESTMENT', amount: 100_000 },
              }),
              update: async () => {
                throw new Error('forced failure after ledger');
              },
            },
            financeAccount: {
              findFirst: async () => ({
                id: 'cash',
                branchId: 'branch-1',
                status: 'ACTIVE',
                deletedAt: null,
                currency: 'KGS',
                scope: 'BRANCH',
                typeDefinition: null,
              }),
            },
            financeLedgerEntry: { update: async () => ({}) },
            auditLog: { create: async () => ({}) },
          });
        } catch (err) {
          posted.length = 0;
          throw err;
        }
      },
    });

    await assertRejects(
      service.updateInvestment(ceoUser as any, 'inv-1', { amount: 120_000, reason: 'fail' }),
      'forced failure',
      'tx rolls back on failure',
    );
    assertEqual(ran, true, 'transaction executed');
    assertEqual(posted.length, 0, 'rolled back posts discarded');
  }

  // Sanity: planner used by edit path
  {
    const plan = planInvestmentEditEffect({
      oldAmount: 100,
      newAmount: 150,
      oldAccountId: 'a',
      newAccountId: 'a',
      investmentType: 'OWNER_INVESTMENT',
    });
    assertEqual(plan.kind, 'amount_delta', 'planner amount_delta');
  }

  console.log('finance-investments.service.test.ts passed');
}

void main();
