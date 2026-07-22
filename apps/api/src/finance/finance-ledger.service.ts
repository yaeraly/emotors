import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FinanceLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';

type PrismaTx = Prisma.TransactionClient;

export type PostLedgerEntryInput = {
  accountId: string;
  branchId?: string | null;
  entryType: FinanceLedgerEntryType;
  amount: number;
  currency?: string;
  transferId?: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  /** When true, allow the resulting account balance to go negative (investment reversals). */
  allowNegativeBalance?: boolean;
};

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Source of truth for account balances: sum of every ledger signedAmount,
   * including OWNER_INVESTMENT / CAPITAL_INJECTION and all other approved entries.
   */
  async recalculateAccountBalance(tx: PrismaTx, accountId: string) {
    const account = await tx.financeAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { id: true, pendingBalance: true },
    });
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const aggregate = await tx.financeLedgerEntry.aggregate({
      where: { accountId },
      _sum: { signedAmount: true },
    });
    const currentBalance = roundMoney(Number(aggregate._sum.signedAmount ?? 0));
    const pendingBalance = roundMoney(Number(account.pendingBalance ?? 0));
    // Available funds = ledger balance minus amounts reserved as pending.
    const availableBalance = roundMoney(currentBalance - pendingBalance);

    await tx.financeAccount.update({
      where: { id: accountId },
      data: {
        currentBalance,
        availableBalance,
      },
    });

    return { currentBalance, availableBalance, pendingBalance };
  }

  async syncAccountBalances(tx: PrismaTx, accountIds: string[]) {
    const uniqueIds = [...new Set(accountIds.filter(Boolean))];
    const results: Array<{ accountId: string; currentBalance: number; availableBalance: number }> = [];
    for (const accountId of uniqueIds) {
      const balances = await this.recalculateAccountBalance(tx, accountId);
      results.push({ accountId, ...balances });
    }
    return results;
  }

  async postLedgerEntry(
    tx: PrismaTx,
    user: AuthUser,
    input: PostLedgerEntryInput,
  ) {
    const amount = roundMoney(Math.abs(input.amount));
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // Serialize balance updates per account so investment credits persist reliably.
    await tx.$queryRaw`SELECT id FROM "FinanceAccount" WHERE id = ${input.accountId} FOR UPDATE`;

    const account = await tx.financeAccount.findFirst({
      where: { id: input.accountId, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const signedAmount = this.resolveSignedAmount(input.entryType, amount);
    const beforeBalance = roundMoney(Number(account.currentBalance));
    const projectedBalance = roundMoney(beforeBalance + signedAmount);

    if (projectedBalance < 0 && !input.allowNegativeBalance) {
      throw new BadRequestException('Insufficient account balance');
    }

    const entry = await tx.financeLedgerEntry.create({
      data: {
        entryNumber: buildFinanceDocumentNumber('FLE'),
        accountId: account.id,
        branchId: input.branchId ?? account.branchId,
        entryType: input.entryType,
        amount,
        signedAmount,
        beforeBalance,
        afterBalance: projectedBalance,
        currency: input.currency ?? account.currency,
        transferId: input.transferId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
        createdById: user.id,
      },
    });

    // Recalculate from the full ledger (includes investments) — no duplicate balance logic.
    const balances = await this.recalculateAccountBalance(tx, account.id);

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: `finance.${input.entryType.toLowerCase()}`,
        entity: 'FinanceLedgerEntry',
        entityId: entry.id,
        metadata: {
          accountId: account.id,
          branchId: input.branchId ?? account.branchId,
          employeeId: user.id,
          role: user.role,
          roles: user.roles ?? [user.role],
          operation: input.entryType,
          amount,
          signedAmount,
          beforeBalance,
          afterBalance: balances.currentBalance,
          transactionNumber: entry.entryNumber,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
      },
    });

    return {
      ...entry,
      amount,
      signedAmount,
      beforeBalance,
      afterBalance: balances.currentBalance,
    };
  }

  private resolveSignedAmount(entryType: FinanceLedgerEntryType, amount: number) {
    switch (entryType) {
      case FinanceLedgerEntryType.TRANSFER_OUT:
      case FinanceLedgerEntryType.EXPENSE:
      case FinanceLedgerEntryType.REFUND:
        return -amount;
      default:
        // OPENING_BALANCE, OWNER_INVESTMENT, CAPITAL_INJECTION, TRANSFER_IN,
        // INCOME, PAYMENT, ADJUSTMENT, CLOSING_BALANCE → credit by default.
        return amount;
    }
  }
}
