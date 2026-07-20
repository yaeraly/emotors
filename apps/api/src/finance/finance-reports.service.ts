import { Injectable } from '@nestjs/common';
import { FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canViewFinanceReports, isHqFinanceUser, resolveFinanceScopeFilter } from './finance-access.util';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';

const TRANSFER_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.TRANSFER_IN,
  FinanceLedgerEntryType.TRANSFER_OUT,
];

const INCOME_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.INCOME,
  FinanceLedgerEntryType.PAYMENT,
  FinanceLedgerEntryType.OWNER_INVESTMENT,
  FinanceLedgerEntryType.CAPITAL_INJECTION,
];

const EXPENSE_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.EXPENSE,
  FinanceLedgerEntryType.REFUND,
];

@Injectable()
export class FinanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthUser, query: FinanceReportQueryDto) {
    if (!canViewFinanceReports(user)) {
      return { accounts: [], totals: { balance: 0, income: 0, expenses: 0, profit: 0 } };
    }

    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        deletedAt: null,
        ...(scopeFilter.scope ? { scope: scopeFilter.scope } : {}),
        ...(scopeFilter.branchId !== undefined ? { branchId: scopeFilter.branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        typeDefinition: true,
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    const branchIds = [...new Set(accounts.map((a) => a.branchId).filter(Boolean))] as string[];
    const ledgerWhere = {
      ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.financeLedgerEntry.aggregate({
        where: { ...ledgerWhere, entryType: { in: INCOME_TYPES } },
        _sum: { amount: true },
      }),
      this.prisma.financeLedgerEntry.aggregate({
        where: { ...ledgerWhere, entryType: { in: EXPENSE_TYPES } },
        _sum: { amount: true },
      }),
    ]);

    const totalBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
    const totalIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

    const branchSummaries = isHqFinanceUser(user)
      ? await Promise.all(
          branchIds.map(async (branchId) => {
            const branchAccounts = accounts.filter((a) => a.branchId === branchId);
            const balance = branchAccounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);
            const branch = branchAccounts[0]?.branch;
            return {
              branchId,
              branchName: branch?.name ?? branchId,
              branchCode: branch?.code ?? '',
              accountCount: branchAccounts.length,
              totalBalance: balance,
            };
          }),
        )
      : [];

    return {
      accounts,
      branchSummaries,
      totals: {
        balance: totalBalance,
        income: totalIncome,
        expenses: totalExpenses,
        profit: totalIncome - totalExpenses,
        transfersExcluded: true,
      },
    };
  }

  async getCashFlow(user: AuthUser, query: FinanceReportQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const entries = await this.prisma.financeLedgerEntry.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        entryType: { notIn: TRANSFER_TYPES },
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 200,
    });

    return entries;
  }

  async listAudit(user: AuthUser, query: FinanceReportQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    return this.prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'finance.' },
        ...(scopeFilter.branchId
          ? {
              metadata: {
                path: ['branchId'],
                equals: scopeFilter.branchId,
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: query.limit ?? 200,
    });
  }
}
