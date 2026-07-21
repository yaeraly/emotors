import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canCreateOwnerInvestment,
} from './finance-access.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber } from './finance-number.util';
import { CreateFinanceInvestmentDto } from './dto/create-finance-investment.dto';

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

    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, deletedAt: null, status: 'ACTIVE' },
      include: { typeDefinition: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (user.branchId && account.branchId && user.branchId !== account.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    assertCanAccessAccountScope(user, account);

    const entryType =
      dto.investmentType === 'INVESTOR_INVESTMENT'
        ? FinanceLedgerEntryType.CAPITAL_INJECTION
        : FinanceLedgerEntryType.OWNER_INVESTMENT;

    const currency = dto.currency || account.currency;
    const investmentDate = new Date(dto.investmentDate);

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: account.branchId,
        entryType,
        amount: Number(dto.amount),
        currency,
        notes: dto.notes,
        referenceType: 'FinanceInvestment',
      });

      const investment = await tx.financeInvestment.create({
        data: {
          investmentNumber: buildFinanceDocumentNumber('FIN'),
          investmentDate,
          investmentType: dto.investmentType,
          amount: dto.amount,
          currency,
          accountId: account.id,
          branchId: account.branchId,
          investorOwnerName: dto.investorOwnerName.trim(),
          providedBy: dto.providedBy.trim(),
          notes: dto.notes?.trim() || null,
          ledgerEntryId: entry.id,
          createdById: user.id,
        },
        include: {
          account: { select: { id: true, name: true, accountNumber: true, branchId: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          ledgerEntry: { select: { id: true, entryNumber: true, entryType: true } },
        },
      });

      await tx.financeLedgerEntry.update({
        where: { id: entry.id },
        data: { referenceType: 'FinanceInvestment', referenceId: investment.id },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'finance.investment_recorded',
          entity: 'FinanceInvestment',
          entityId: investment.id,
          metadata: {
            investmentNumber: investment.investmentNumber,
            investmentType: investment.investmentType,
            accountId: account.id,
            branchId: account.branchId,
            amount: Number(dto.amount),
            currency,
            investorOwnerName: investment.investorOwnerName,
            providedBy: investment.providedBy,
            ledgerEntryId: entry.id,
            ledgerEntryNumber: entry.entryNumber,
          },
        },
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_INVESTMENT_RECORDED,
        branchId: account.branchId ?? undefined,
        entityType: 'FinanceInvestment',
        entityId: investment.id,
        referenceNumber: investment.investmentNumber,
      });

      return investment;
    });
  }

  async listInvestments(user: AuthUser, branchId?: string) {
    const effectiveBranchId = branchId ?? user.branchId ?? undefined;
    return this.prisma.financeInvestment.findMany({
      where: {
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, branchId: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        ledgerEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryType: true,
            beforeBalance: true,
            afterBalance: true,
          },
        },
      },
      orderBy: [{ investmentDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }
}
