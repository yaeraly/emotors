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
};

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postLedgerEntry(
    tx: PrismaTx,
    user: AuthUser,
    input: PostLedgerEntryInput,
  ) {
    const amount = roundMoney(Math.abs(input.amount));
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const account = await tx.financeAccount.findFirst({
      where: { id: input.accountId, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const signedAmount = this.resolveSignedAmount(input.entryType, amount);
    const beforeBalance = roundMoney(Number(account.currentBalance));
    const afterBalance = roundMoney(beforeBalance + signedAmount);

    if (afterBalance < 0) {
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
        afterBalance,
        currency: input.currency ?? account.currency,
        transferId: input.transferId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
        createdById: user.id,
      },
    });

    await tx.financeAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: afterBalance,
        availableBalance: afterBalance,
      },
    });

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
          beforeBalance,
          afterBalance,
          transactionNumber: entry.entryNumber,
        },
      },
    });

    return entry;
  }

  private resolveSignedAmount(entryType: FinanceLedgerEntryType, amount: number) {
    switch (entryType) {
      case FinanceLedgerEntryType.TRANSFER_OUT:
      case FinanceLedgerEntryType.EXPENSE:
      case FinanceLedgerEntryType.REFUND:
        return -amount;
      default:
        return amount;
    }
  }
}
