import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, FinanceExpenseStatus, FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canManageFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { CreateFinanceExpenseDto } from './dto/create-finance-expense.dto';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';

@Injectable()
export class FinanceExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async listExpenses(user: AuthUser, query: FinanceReportQueryDto & { status?: FinanceExpenseStatus }) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    return this.prisma.financeExpense.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, currency: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { expenseDate: 'desc' },
      take: query.limit ?? 200,
    });
  }

  async createExpense(user: AuthUser, dto: CreateFinanceExpenseDto) {
    if (!canManageFinanceAccounts(user)) {
      throw new ForbiddenException('Forbidden');
    }

    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!account) throw new NotFoundException('Account not found');
    assertCanAccessAccountScope(user, account);

    const amount = roundMoney(Number(dto.amount));
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');

    const status = dto.requiresApproval ? FinanceExpenseStatus.PENDING_APPROVAL : FinanceExpenseStatus.PAID;

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.financeExpense.create({
        data: {
          expenseNumber: buildFinanceDocumentNumber('FEX'),
          category: dto.category,
          accountId: account.id,
          branchId: account.branchId,
          amount,
          currency: account.currency,
          payee: dto.payee,
          purpose: dto.purpose,
          documentNumber: dto.documentNumber,
          attachmentUrl: dto.attachmentUrl,
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
          status,
          notes: dto.notes,
          createdById: user.id,
        },
        include: {
          account: { select: { id: true, name: true, accountNumber: true } },
        },
      });

      if (status === FinanceExpenseStatus.PAID) {
        const entry = await this.ledgerService.postLedgerEntry(tx, user, {
          accountId: account.id,
          branchId: account.branchId,
          entryType: FinanceLedgerEntryType.EXPENSE,
          amount,
          currency: account.currency,
          referenceType: 'FinanceExpense',
          referenceId: expense.id,
          notes: dto.purpose ?? dto.category,
        });
        await tx.financeExpense.update({
          where: { id: expense.id },
          data: { ledgerEntryId: entry.id },
        });
      } else {
        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.FINANCE_EXPENSE_PENDING,
          branchId: account.branchId ?? undefined,
          entityType: 'FinanceExpense',
          entityId: expense.id,
          referenceNumber: expense.expenseNumber,
        });
      }

      return expense;
    });
  }
}
