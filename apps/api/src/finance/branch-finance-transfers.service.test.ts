import {
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  FinanceTransferStatus,
  Role,
} from '@prisma/client';
import { BranchFinanceTransfersService } from './branch-finance-transfers.service';

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

const branchId = 'branch-1';
const cashAccountId = 'cash-1';
const qrAccountId = 'qr-1';

const cashierUser = {
  id: 'cashier-1',
  email: 'cashier@test.com',
  fullName: 'Cashier',
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId,
  permissions: ['finance.view'],
};

const accountantUser = {
  id: 'acc-1',
  email: 'acc@test.com',
  fullName: 'Accountant',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId,
  permissions: ['finance.view', 'finance.manage'],
};

function accountRow(id: string, name: string, availableBalance = 10_000) {
  return {
    id,
    name,
    accountNumber: `${id}-num`,
    branchId,
    scope: FinanceAccountScope.BRANCH,
    status: FinanceAccountStatus.ACTIVE,
    currency: 'KGS',
    currentBalance: availableBalance,
    availableBalance,
    deletedAt: null,
  };
}

function createService() {
  const posted: Array<{ entryType: FinanceLedgerEntryType; accountId: string; amount: number }> = [];
  const audits: string[] = [];
  const balances: Record<string, number> = {
    [cashAccountId]: 10_000,
    [qrAccountId]: 10_000,
  };
  let transfer = {
    id: 'tr-1',
    transferNumber: 'BTR-1',
    sourceAccountId: cashAccountId,
    destinationAccountId: qrAccountId,
    branchId,
    amount: 1_500,
    currency: 'KGS',
    status: FinanceTransferStatus.PENDING,
    requiresApproval: true,
    reason: 'Shift balancing',
    returnReason: null,
    notes: null,
    version: 1,
    createdById: cashierUser.id,
    cashierId: cashierUser.id,
    accountantId: null,
    approvedById: null,
    approvedAt: null,
    completedAt: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceAccount: accountRow(cashAccountId, 'Cash', balances[cashAccountId]),
    destinationAccount: accountRow(qrAccountId, 'QR', balances[qrAccountId]),
    createdBy: { id: cashierUser.id, fullName: 'Cashier', role: Role.CASHIER },
    accountant: null,
    cashier: { id: cashierUser.id, fullName: 'Cashier', role: Role.CASHIER },
    approvedBy: null,
  };

  const tx = {
    $queryRaw: async () => [],
    financeTransfer: {
      findFirst: async ({ where }: any) => {
        if (where.idempotencyKey && where.idempotencyKey === 'dup-key') {
          return { ...transfer, idempotencyKey: 'dup-key' };
        }
        if (where.id === transfer.id && where.branchId === branchId) {
          return transfer;
        }
        return null;
      },
      create: async ({ data }: any) => {
        transfer = {
          ...transfer,
          ...data,
          amount: Number(data.amount),
          sourceAccount: accountRow(data.sourceAccountId, data.sourceAccountId === cashAccountId ? 'Cash' : 'QR'),
          destinationAccount: accountRow(
            data.destinationAccountId,
            data.destinationAccountId === qrAccountId ? 'QR' : 'Cash',
          ),
        };
        return transfer;
      },
      update: async ({ data }: any) => {
        transfer = {
          ...transfer,
          ...data,
          amount: data.amount != null ? Number(data.amount) : transfer.amount,
        };
        return transfer;
      },
      findUniqueOrThrow: async () => transfer,
    },
    financeAccount: {
      findFirst: async ({ where }: any) => {
        if (where.id === cashAccountId) return accountRow(cashAccountId, 'Cash', balances[cashAccountId]);
        if (where.id === qrAccountId) return accountRow(qrAccountId, 'QR', balances[qrAccountId]);
        return null;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data.action);
        return data;
      },
    },
  };

  const prisma = {
    $transaction: async (fn: any) => fn(tx),
    financeAccountAssignment: {
      findMany: async () => [{ accountId: cashAccountId }, { accountId: qrAccountId }],
    },
    financeTransfer: {
      findMany: async () => [transfer],
    },
  };

  const ledgerService = {
    postLedgerEntry: async (_tx: unknown, _user: unknown, input: any) => {
      posted.push({
        entryType: input.entryType,
        accountId: input.accountId,
        amount: input.amount,
      });
      return input;
    },
  };

  const service = new BranchFinanceTransfersService(prisma as any, ledgerService as any);

  return {
    service,
    posted,
    audits,
    getTransfer: () => transfer,
    setTransferStatus: (status: FinanceTransferStatus) => {
      transfer = { ...transfer, status };
    },
    setSourceBalance: (balance: number) => {
      balances[cashAccountId] = balance;
      transfer = {
        ...transfer,
        sourceAccount: accountRow(cashAccountId, 'Cash', balance),
      };
    },
  };
}

async function runTests() {
  {
    const { service, posted, audits, getTransfer } = createService();
    const created = await service.createTransfer(cashierUser as any, {
      sourceAccountId: cashAccountId,
      destinationAccountId: qrAccountId,
      amount: 1_500,
      reason: 'Shift balancing',
    });
    assertEqual(created.status, FinanceTransferStatus.PENDING, 'create leaves transfer pending');
    assertEqual(posted.length, 0, 'create does not post ledger entries');
    assertEqual(audits.includes('BRANCH_TRANSFER_CREATED'), true, 'create writes audit');
    assertEqual(getTransfer().amount, 1_500, 'create stores amount');
  }

  {
    const { service, posted } = createService();
    const approved = await service.approveTransfer(accountantUser as any, 'tr-1');
    assertEqual(approved.status, FinanceTransferStatus.COMPLETED, 'approve completes transfer');
    assertEqual(posted.length, 2, 'approve posts two ledger entries');
    assertEqual(posted[0]?.entryType, FinanceLedgerEntryType.TRANSFER_OUT, 'first entry is transfer out');
    assertEqual(posted[0]?.accountId, cashAccountId, 'transfer out from source');
    assertEqual(posted[1]?.entryType, FinanceLedgerEntryType.TRANSFER_IN, 'second entry is transfer in');
    assertEqual(posted[1]?.accountId, qrAccountId, 'transfer in to destination');
    assertEqual(posted[0]?.amount, 1_500, 'transfer out amount');
    assertEqual(posted[1]?.amount, 1_500, 'transfer in amount');
  }

  {
    const { service, posted, audits } = createService();
    const rejected = await service.rejectTransfer(accountantUser as any, 'tr-1', {
      reason: 'Not enough documentation',
    });
    assertEqual(rejected.status, FinanceTransferStatus.REJECTED, 'reject marks transfer rejected');
    assertEqual(posted.length, 0, 'reject does not post ledger entries');
    assertEqual(audits.includes('BRANCH_TRANSFER_REJECTED'), true, 'reject writes audit');
  }

  {
    const { service, getTransfer } = createService();
    const updated = await service.updateTransfer(cashierUser as any, 'tr-1', {
      amount: 2_000,
      reason: 'Updated reason',
    });
    assertEqual(updated.status, FinanceTransferStatus.PENDING, 'update resets to pending');
    assertEqual(getTransfer().amount, 2_000, 'update changes amount');
  }

  {
    const { service, setSourceBalance } = createService();
    setSourceBalance(500);
    await assertRejects(
      service.approveTransfer(accountantUser as any, 'tr-1'),
      'Недостаточно средств',
      'approve rejects insufficient balance',
    );
  }

  {
    const { service } = createService();
    await assertRejects(
      service.createTransfer(cashierUser as any, {
        sourceAccountId: cashAccountId,
        destinationAccountId: cashAccountId,
        amount: 100,
        reason: 'Same account',
      }),
      'не могут совпадать',
      'create rejects same account',
    );
  }

  {
    const { service } = createService();
    const existing = await service.createTransfer(cashierUser as any, {
      sourceAccountId: cashAccountId,
      destinationAccountId: qrAccountId,
      amount: 1_500,
      reason: 'Shift balancing',
      idempotencyKey: 'dup-key',
    });
    assertEqual(existing.transferNumber, 'BTR-1', 'idempotent create returns existing transfer');
  }

  console.log('branch-finance-transfers.service.test.ts passed');
}

void runTests();
