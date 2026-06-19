import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { BranchAccessService } from '../common/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashboxDto, FinanceTransactionDto, MoneyEntryDto } from './dto';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  createCashbox(user: AuthUser, dto: CashboxDto) {
    const branchId = this.branchAccess.resolveBranchId(user, dto.branchId);
    return this.prisma.cashbox.create({
      data: { branchId, name: dto.name },
    });
  }

  listCashboxes(user: AuthUser) {
    return this.prisma.cashbox.findMany({
      where: this.branchAccess.scope(user),
      orderBy: { name: 'asc' },
    });
  }

  async createIncome(user: AuthUser, dto: MoneyEntryDto) {
    const branchId = await this.resolveFinanceBranch(user, dto);
    return this.prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          branchId,
          cashboxId: dto.cashboxId,
          title: dto.title,
          amount: dto.amount,
          source: dto.source,
        },
      });
      await tx.financeTransaction.create({
        data: {
          branchId,
          cashboxId: dto.cashboxId,
          type: 'INCOME',
          amount: dto.amount,
          description: dto.title,
        },
      });
      if (dto.cashboxId) {
        await tx.cashbox.update({
          where: { id: dto.cashboxId },
          data: { balance: { increment: dto.amount } },
        });
      }
      return income;
    });
  }

  async createExpense(user: AuthUser, dto: MoneyEntryDto) {
    const branchId = await this.resolveFinanceBranch(user, dto);
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          branchId,
          cashboxId: dto.cashboxId,
          title: dto.title,
          amount: dto.amount,
          category: dto.category,
        },
      });
      await tx.financeTransaction.create({
        data: {
          branchId,
          cashboxId: dto.cashboxId,
          type: 'EXPENSE',
          amount: dto.amount,
          description: dto.title,
        },
      });
      if (dto.cashboxId) {
        await tx.cashbox.update({
          where: { id: dto.cashboxId },
          data: { balance: { decrement: dto.amount } },
        });
      }
      return expense;
    });
  }

  async createTransaction(user: AuthUser, dto: FinanceTransactionDto) {
    const branchId = await this.resolveFinanceBranch(user, dto);
    return this.prisma.financeTransaction.create({
      data: {
        branchId,
        cashboxId: dto.cashboxId,
        type: dto.type,
        amount: dto.amount,
        description: dto.description,
      },
    });
  }

  listTransactions(user: AuthUser) {
    return this.prisma.financeTransaction.findMany({
      where: this.branchAccess.scope(user),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async summary(user: AuthUser) {
    const [cashboxes, incomes, expenses, debtCustomers] = await Promise.all([
      this.listCashboxes(user),
      this.prisma.income.findMany({ where: this.branchAccess.scope(user) }),
      this.prisma.expense.findMany({ where: this.branchAccess.scope(user) }),
      this.prisma.customer.findMany({
        where: { ...this.branchAccess.scope(user), totalDebtAmount: { gt: 0 } },
      }),
    ]);

    return {
      cashboxBalance: cashboxes.reduce(
        (sum, cashbox) => sum + Number(cashbox.balance),
        0,
      ),
      income: incomes.reduce((sum, income) => sum + Number(income.amount), 0),
      expense: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
      debt: debtCustomers.reduce(
        (sum, customer) => sum + Number(customer.totalDebtAmount),
        0,
      ),
    };
  }

  debtReport(user: AuthUser) {
    return this.prisma.customer.findMany({
      where: { ...this.branchAccess.scope(user), totalDebtAmount: { gt: 0 } },
      orderBy: { totalDebtAmount: 'desc' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        totalDebtAmount: true,
        branchId: true,
      },
    });
  }

  async cashflow(user: AuthUser) {
    const transactions = await this.listTransactions(user);
    return transactions.reduce(
      (acc, transaction) => {
        const amount = Number(transaction.amount);
        if (transaction.type === 'EXPENSE') {
          acc.outflow += amount;
        } else {
          acc.inflow += amount;
        }
        acc.net = acc.inflow - acc.outflow;
        return acc;
      },
      { inflow: 0, outflow: 0, net: 0 },
    );
  }

  async profit(user: AuthUser) {
    const sales = await this.prisma.sale.findMany({
      where: this.branchAccess.scope(user),
    });
    const expenses = await this.prisma.expense.findMany({
      where: this.branchAccess.scope(user),
    });
    const grossProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0);
    const expenseTotal = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );
    return {
      grossProfit,
      expenses: expenseTotal,
      netProfit: grossProfit - expenseTotal,
    };
  }

  async productAnalysis(user: AuthUser) {
    const items = await this.prisma.saleItem.findMany({
      where: this.branchAccess.scope(user),
      include: { product: true },
    });
    const byProduct = new Map<string, { name: string; revenue: number; units: number; profit: number }>();
    for (const item of items) {
      const key = item.productId ?? item.description;
      const current = byProduct.get(key) ?? {
        name: item.product?.name ?? item.description,
        revenue: 0,
        units: 0,
        profit: 0,
      };
      current.revenue += Number(item.total);
      current.units += item.quantity;
      current.profit += Number(item.profit);
      byProduct.set(key, current);
    }
    const rows = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    let cumulative = 0;
    return rows.map((row) => {
      cumulative += row.revenue;
      const share = totalRevenue > 0 ? cumulative / totalRevenue : 0;
      return {
        ...row,
        abcClass: share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C',
        xyzClass: row.units >= 30 ? 'X' : row.units >= 10 ? 'Y' : 'Z',
        marginPercent: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0,
      };
    });
  }

  private async resolveFinanceBranch(
    user: AuthUser,
    dto: { branchId?: string; cashboxId?: string },
  ) {
    if (dto.cashboxId) {
      const cashbox = await this.prisma.cashbox.findFirst({
        where: { id: dto.cashboxId, ...this.branchAccess.scope(user) },
      });
      if (!cashbox) {
        throw new NotFoundException('Cashbox not found');
      }
      return cashbox.branchId;
    }
    return this.branchAccess.resolveBranchId(user, dto.branchId);
  }
}
