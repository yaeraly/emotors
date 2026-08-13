import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FinanceLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canCreateOwnerInvestment,
  canManageFinanceInvestments,
} from './finance-access.util';
import { canPermanentDeleteBusinessData } from '../rbac/rbac';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import {
  CreateFinanceInvestmentDto,
  DeleteFinanceInvestmentDto,
  UpdateFinanceInvestmentDto,
} from './dto/create-finance-investment.dto';
import { planInvestmentEditEffect } from './finance-investments.util';

type Tx = Prisma.TransactionClient;

const INVESTMENT_INCLUDE = {
  account: {
    select: {
      id: true,
      name: true,
      accountNumber: true,
      branchId: true,
      status: true,
      currency: true,
      currentBalance: true,
      availableBalance: true,
    },
  },
  createdBy: { select: { id: true, fullName: true, email: true } },
  deletedBy: { select: { id: true, fullName: true, email: true } },
  ledgerEntry: {
    select: {
      id: true,
      entryNumber: true,
      entryType: true,
      amount: true,
      signedAmount: true,
      beforeBalance: true,
      afterBalance: true,
    },
  },
} as const;

@Injectable()
export class FinanceInvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async createInvestment(user: AuthUser, dto: CreateFinanceInvestmentDto) {
    if (!canCreateOwnerInvestment(user)) {
      throw new ForbiddenException('Only authorized owners can record investments');
    }

    const account = await this.findActiveAccount(dto.accountId, user);
    const entryType = this.entryTypeFor(dto.investmentType);
    const currency = dto.currency || account.currency;
    const amount = roundMoney(Number(dto.amount));
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const investmentDate = new Date(dto.investmentDate);

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: account.branchId,
        entryType,
        amount,
        currency,
        notes: dto.notes,
        referenceType: 'FinanceInvestment',
      });

      const investment = await tx.financeInvestment.create({
        data: {
          investmentNumber: buildFinanceDocumentNumber('FIN'),
          investmentDate,
          investmentType: dto.investmentType,
          amount,
          currency,
          accountId: account.id,
          branchId: account.branchId,
          investorOwnerName: dto.investorOwnerName.trim(),
          notes: dto.notes?.trim() || null,
          ledgerEntryId: entry.id,
          createdById: user.id,
        },
      });

      await tx.financeLedgerEntry.update({
        where: { id: entry.id },
        data: { referenceType: 'FinanceInvestment', referenceId: investment.id },
      });

      // Ensure selected account balance includes this investment credit.
      await this.ledgerService.recalculateAccountBalance(tx, account.id);

      const hydrated = await tx.financeInvestment.findUniqueOrThrow({
        where: { id: investment.id },
        include: INVESTMENT_INCLUDE,
      });

      await this.audit(tx, user, 'finance.investment.created', investment.id, null, {
        investmentNumber: hydrated.investmentNumber,
        investmentType: hydrated.investmentType,
        accountId: account.id,
        amount,
        currency,
        investorOwnerName: hydrated.investorOwnerName,
        ledgerEntryId: entry.id,
        ledgerEntryNumber: entry.entryNumber,
        accountBalanceAfter: Number(hydrated.account?.currentBalance ?? 0),
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_INVESTMENT_RECORDED,
        branchId: account.branchId ?? undefined,
        entityType: 'FinanceInvestment',
        entityId: investment.id,
        referenceNumber: hydrated.investmentNumber,
      });

      return this.toResponse(hydrated);
    });
  }

  async listInvestments(
    user: AuthUser,
    query: { branchId?: string; includeDeleted?: string | boolean } = {},
  ) {
    const effectiveBranchId = query.branchId ?? user.branchId ?? undefined;
    const includeDeleted =
      query.includeDeleted === true ||
      query.includeDeleted === '1' ||
      query.includeDeleted === 'true';

    if (includeDeleted && !canManageFinanceInvestments(user)) {
      throw new ForbiddenException('Only CEO/Owner can view deleted investments');
    }

    const rows = await this.prisma.financeInvestment.findMany({
      where: {
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: INVESTMENT_INCLUDE,
      orderBy: [{ investmentDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getInvestment(user: AuthUser, id: string) {
    const investment = await this.prisma.financeInvestment.findUnique({
      where: { id },
      include: INVESTMENT_INCLUDE,
    });
    if (!investment) throw new NotFoundException('Investment not found');
    if (investment.deletedAt && !canManageFinanceInvestments(user)) {
      throw new ForbiddenException('Investment is deleted');
    }
    if (user.branchId && investment.branchId && user.branchId !== investment.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    return this.toResponse(investment);
  }

  async updateInvestment(user: AuthUser, id: string, dto: UpdateFinanceInvestmentDto) {
    if (!canManageFinanceInvestments(user)) {
      throw new ForbiddenException('Only CEO/Owner can edit investments');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeInvestment.findUnique({
        where: { id },
        include: INVESTMENT_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Investment not found');
      if (existing.deletedAt) {
        throw new BadRequestException('Deleted investments cannot be edited');
      }
      this.assertNotLocked(existing);

      const nextAccountId = dto.accountId ?? existing.accountId;
      const nextAmount = roundMoney(Number(dto.amount ?? existing.amount));
      if (nextAmount <= 0) throw new BadRequestException('Amount must be greater than zero');
      const nextCurrency = dto.currency ?? existing.currency;
      const nextDate = dto.investmentDate ? new Date(dto.investmentDate) : existing.investmentDate;
      const nextType = dto.investmentType ?? existing.investmentType;
      const nextName =
        dto.investorOwnerName !== undefined
          ? dto.investorOwnerName.trim()
          : existing.investorOwnerName;
      const nextNotes =
        dto.notes !== undefined ? dto.notes?.trim() || null : existing.notes;

      const oldAmount = Number(existing.amount);
      const plan = planInvestmentEditEffect({
        oldAmount,
        newAmount: nextAmount,
        oldAccountId: existing.accountId,
        newAccountId: nextAccountId,
        investmentType: nextType,
      });

      let ledgerEntryId = existing.ledgerEntryId;
      let reversalEntryId: string | null = null;

      if (plan.kind === 'account_change') {
        const newAccount = await this.findActiveAccount(nextAccountId, user, tx);
        // Reverse old account effect fully, then credit the new account once.
        const reversal = await this.ledgerService.postLedgerEntry(tx, user, {
          accountId: existing.accountId,
          branchId: existing.branchId,
          entryType: FinanceLedgerEntryType.EXPENSE,
          amount: plan.reverseAmount,
          currency: existing.currency,
          referenceType: 'FinanceInvestmentEditReversal',
          referenceId: existing.id,
          notes: `Investment ${existing.investmentNumber} account change reversal`,
          allowNegativeBalance: true,
        });
        reversalEntryId = reversal.id;

        const credit = await this.ledgerService.postLedgerEntry(tx, user, {
          accountId: newAccount.id,
          branchId: newAccount.branchId,
          entryType: plan.creditEntryType,
          amount: plan.creditAmount,
          currency: nextCurrency,
          referenceType: 'FinanceInvestment',
          referenceId: existing.id,
          notes: nextNotes ?? `Investment ${existing.investmentNumber} account change`,
        });
        ledgerEntryId = credit.id;

        await this.audit(tx, user, 'finance.investment.account_changed', id, {
          accountId: existing.accountId,
          amount: oldAmount,
          ledgerEntryId: existing.ledgerEntryId,
        }, {
          accountId: newAccount.id,
          amount: nextAmount,
          ledgerEntryId: credit.id,
          reversalEntryId: reversal.id,
          reason: dto.reason ?? null,
        });

        await this.audit(tx, user, 'finance.investment.financial_effect_reversed', id, {
          amount: plan.reverseAmount,
          accountId: existing.accountId,
        }, {
          reversalEntryId: reversal.id,
          reversalEntryNumber: reversal.entryNumber,
        });
      } else if (plan.kind === 'amount_delta') {
        // Post only the delta once — never re-credit the full investment amount.
        await this.ledgerService.postLedgerEntry(tx, user, {
          accountId: existing.accountId,
          branchId: existing.branchId,
          entryType: plan.entryType,
          amount: plan.postAmount,
          currency: nextCurrency,
          referenceType: 'FinanceInvestmentAdjustment',
          referenceId: existing.id,
          notes:
            plan.delta > 0
              ? `Investment ${existing.investmentNumber} amount increase`
              : `Investment ${existing.investmentNumber} amount decrease`,
          allowNegativeBalance: plan.delta < 0,
        });

        await this.audit(tx, user, 'finance.investment.amount_changed', id, {
          amount: oldAmount,
          currency: existing.currency,
        }, {
          amount: nextAmount,
          currency: nextCurrency,
          delta: plan.delta,
          reason: dto.reason ?? null,
        });
      }

      const nextAccount =
        plan.kind === 'account_change'
          ? await this.findActiveAccount(nextAccountId, user, tx)
          : existing.account;

      const updated = await tx.financeInvestment.update({
        where: { id },
        data: {
          accountId: nextAccountId,
          branchId: nextAccount?.branchId ?? existing.branchId,
          amount: nextAmount,
          currency: nextCurrency,
          investmentDate: nextDate,
          investmentType: nextType,
          investorOwnerName: nextName,
          notes: nextNotes,
          ledgerEntryId,
        },
        include: INVESTMENT_INCLUDE,
      });

      await this.audit(tx, user, 'finance.investment.updated', id, {
        amount: oldAmount,
        currency: existing.currency,
        accountId: existing.accountId,
        investmentDate: existing.investmentDate,
        investmentType: existing.investmentType,
        investorOwnerName: existing.investorOwnerName,
        notes: existing.notes,
        ledgerEntryId: existing.ledgerEntryId,
      }, {
        amount: nextAmount,
        currency: nextCurrency,
        accountId: nextAccountId,
        investmentDate: nextDate,
        investmentType: nextType,
        investorOwnerName: nextName,
        notes: nextNotes,
        ledgerEntryId,
        reversalEntryId,
        reason: dto.reason ?? null,
      });

      return this.toResponse(updated);
    });
  }

  async deleteInvestment(user: AuthUser, id: string, dto: DeleteFinanceInvestmentDto) {
    if (!canPermanentDeleteBusinessData(user)) {
      throw new ForbiddenException('Only HQ Admin can delete investments');
    }

    const reason = String(dto.reason || '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Deletion reason must be at least 3 characters');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeInvestment.findUnique({
        where: { id },
        include: INVESTMENT_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Investment not found');
      if (existing.deletedAt) {
        throw new BadRequestException('Investment is already deleted');
      }
      this.assertNotLocked(existing);

      const amount = roundMoney(Number(existing.amount));
      // Always reverse the investment credit on the linked account, even if cash was later spent.
      const reversal = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: existing.accountId,
        branchId: existing.branchId,
        entryType: FinanceLedgerEntryType.EXPENSE,
        amount,
        currency: existing.currency,
        referenceType: 'FinanceInvestmentDeletionReversal',
        referenceId: existing.id,
        notes: `Investment ${existing.investmentNumber} deletion: ${reason}`,
        allowNegativeBalance: true,
      });

      const deleted = await tx.financeInvestment.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
          deletionReason: reason,
        },
        include: INVESTMENT_INCLUDE,
      });

      await this.audit(tx, user, 'finance.investment.deleted', id, {
        amount,
        currency: existing.currency,
        accountId: existing.accountId,
        ledgerEntryId: existing.ledgerEntryId,
      }, {
        deletedAt: deleted.deletedAt,
        deletedById: user.id,
        deletionReason: reason,
        reversalEntryId: reversal.id,
        reversalEntryNumber: reversal.entryNumber,
      });

      await this.audit(tx, user, 'finance.investment.financial_effect_reversed', id, {
        amount,
        accountId: existing.accountId,
      }, {
        reversalEntryId: reversal.id,
        reversalEntryNumber: reversal.entryNumber,
      });

      return this.toResponse(deleted);
    });
  }

  private entryTypeFor(type: string) {
    return type === 'INVESTOR_INVESTMENT'
      ? FinanceLedgerEntryType.CAPITAL_INJECTION
      : FinanceLedgerEntryType.OWNER_INVESTMENT;
  }

  private assertNotLocked(investment: { ledgerEntry?: { id: string } | null }) {
    // No closed-period / reconciliation lock exists for investments yet.
    // Keep hook for future immutable finance controls.
    if (!investment.ledgerEntry) {
      throw new BadRequestException(
        'Investment is missing linked finance transaction; use correction workflow',
      );
    }
  }

  private async findActiveAccount(accountId: string, user: AuthUser, tx?: Tx) {
    const db = tx ?? this.prisma;
    const account = await db.financeAccount.findFirst({
      where: { id: accountId, deletedAt: null, status: 'ACTIVE' },
      include: { typeDefinition: true },
    });
    if (!account) throw new NotFoundException('Account not found or inactive');
    if (user.branchId && account.branchId && user.branchId !== account.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    assertCanAccessAccountScope(user, account);
    return account;
  }

  private toResponse(investment: any) {
    const account = investment.account
      ? {
          ...investment.account,
          currentBalance:
            investment.account.currentBalance != null
              ? Number(investment.account.currentBalance)
              : undefined,
          availableBalance:
            investment.account.availableBalance != null
              ? Number(investment.account.availableBalance)
              : undefined,
        }
      : investment.account;
    const ledgerEntry = investment.ledgerEntry
      ? {
          ...investment.ledgerEntry,
          amount: Number(investment.ledgerEntry.amount),
          signedAmount:
            investment.ledgerEntry.signedAmount != null
              ? Number(investment.ledgerEntry.signedAmount)
              : undefined,
          beforeBalance: Number(investment.ledgerEntry.beforeBalance),
          afterBalance: Number(investment.ledgerEntry.afterBalance),
        }
      : investment.ledgerEntry;

    return {
      ...investment,
      amount: Number(investment.amount),
      deleted: !!investment.deletedAt,
      account,
      ledgerEntry,
    };
  }

  private async audit(
    tx: Tx,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'FinanceInvestment',
        entityId,
        metadata: {
          actorId: user.id,
          actorName: user.fullName ?? user.email,
          timestamp: new Date().toISOString(),
          oldValue: oldValue as Prisma.InputJsonValue | null,
          newValue: newValue as Prisma.InputJsonValue | null,
        },
      },
    });
  }
}
