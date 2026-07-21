import { Injectable } from '@nestjs/common';
import {
  CashierShiftStatus,
  FinanceLedgerEntryType,
  FinanceTransferStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canViewFinanceReports, isHqFinanceUser, resolveFinanceScopeFilter } from './finance-access.util';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';

const OPERATING_INCOME_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.INCOME,
  FinanceLedgerEntryType.PAYMENT,
];

const OPERATING_EXPENSE_TYPES: FinanceLedgerEntryType[] = [
  FinanceLedgerEntryType.EXPENSE,
  FinanceLedgerEntryType.REFUND,
];

@Injectable()
export class FinanceDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(user: AuthUser, query: FinanceReportQueryDto) {
    if (!canViewFinanceReports(user)) {
      return this.emptyDashboard();
    }

    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        deletedAt: null,
        ...(scopeFilter.scope ? { scope: scopeFilter.scope } : {}),
        ...(scopeFilter.branchId !== undefined ? { branchId: scopeFilter.branchId } : {}),
      },
      include: { typeDefinition: true, branch: { select: { id: true, name: true, code: true } } },
    });

    const sumByType = (typeCode: string) =>
      accounts
        .filter((account) => account.typeCode === typeCode)
        .reduce((sum, account) => sum + Number(account.currentBalance), 0);

    const ledgerBase = {
      ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
    };

    const [todayIncome, todayExpenses, openShifts, pendingTransfers, pendingReconciliations] =
      await Promise.all([
        this.prisma.financeLedgerEntry.aggregate({
          where: {
            ...ledgerBase,
            entryType: { in: OPERATING_INCOME_TYPES },
            createdAt: { gte: todayStart },
          },
          _sum: { amount: true },
        }),
        this.prisma.financeLedgerEntry.aggregate({
          where: {
            ...ledgerBase,
            entryType: { in: OPERATING_EXPENSE_TYPES },
            createdAt: { gte: todayStart },
          },
          _sum: { amount: true },
        }),
        this.prisma.cashierShift.count({
          where: {
            status: CashierShiftStatus.OPEN,
            ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
          },
        }),
        this.prisma.financeTransfer.count({
          where: {
            status: {
              in: [FinanceTransferStatus.PENDING_CASHIER, FinanceTransferStatus.PENDING],
            },
            ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
          },
        }),
        this.prisma.financeReconciliation.count({
          where: {
            status: 'PENDING',
            ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
          },
        }),
      ]);

    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);
    const availableBalance = accounts.reduce((sum, a) => sum + Number(a.availableBalance), 0);
    const pendingBalance = accounts.reduce((sum, a) => sum + Number(a.pendingBalance), 0);
    const todayIncomeAmount = Number(todayIncome._sum.amount ?? 0);
    const todayExpensesAmount = Number(todayExpenses._sum.amount ?? 0);

    const hqAccounts = accounts.filter((a) => a.scope === 'HQ');
    const branchAccounts = accounts.filter((a) => a.scope === 'BRANCH');

    const branchSummaries = isHqFinanceUser(user)
      ? Object.values(
          branchAccounts.reduce<Record<string, { branchId: string; branchName: string; totalBalance: number; accountCount: number }>>(
            (acc, account) => {
              const branchId = account.branchId ?? 'unknown';
              if (!acc[branchId]) {
                acc[branchId] = {
                  branchId,
                  branchName: account.branch?.name ?? branchId,
                  totalBalance: 0,
                  accountCount: 0,
                };
              }
              acc[branchId].totalBalance += Number(account.currentBalance);
              acc[branchId].accountCount += 1;
              return acc;
            },
            {},
          ),
        )
      : [];

    return {
      cards: {
        totalBalance,
        cashBalance: sumByType('CASH') + sumByType('PETTY_CASH'),
        bankBalance: sumByType('BANK') + sumByType('DEPOSIT'),
        qrBalance: sumByType('QR'),
        posBalance: sumByType('POS'),
        availableBalance,
        pendingBalance,
        todayIncome: todayIncomeAmount,
        todayExpenses: todayExpensesAmount,
        netCashFlow: todayIncomeAmount - todayExpensesAmount,
        openShifts,
        pendingTransfers,
        pendingReconciliations,
      },
      hqTotals: isHqFinanceUser(user)
        ? {
            balance: hqAccounts.reduce((sum, a) => sum + Number(a.currentBalance), 0),
            accountCount: hqAccounts.length,
          }
        : null,
      branchSummaries,
      scope: scopeFilter,
    };
  }

  private emptyDashboard() {
    return {
      cards: {
        totalBalance: 0,
        cashBalance: 0,
        bankBalance: 0,
        qrBalance: 0,
        posBalance: 0,
        availableBalance: 0,
        pendingBalance: 0,
        todayIncome: 0,
        todayExpenses: 0,
        netCashFlow: 0,
        openShifts: 0,
        pendingTransfers: 0,
        pendingReconciliations: 0,
      },
      hqTotals: null,
      branchSummaries: [],
      scope: {},
    };
  }
}
