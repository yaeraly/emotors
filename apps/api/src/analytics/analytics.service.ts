import { Injectable } from '@nestjs/common';
import { Role, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  hqDashboard(user: AuthUser) {
    return this.branchComparison(user);
  }

  async branchComparison(user: AuthUser) {
    const branches = await this.prisma.branch.findMany({
      where: user.role === Role.OWNER ? {} : { id: user.branchId },
      orderBy: { name: 'asc' },
    });
    return Promise.all(branches.map((branch) => this.branchMetrics(branch)));
  }

  sales(user: AuthUser) {
    return this.metric(user, 'totalAmount');
  }

  profit(user: AuthUser) {
    return this.metric(user, 'profitAmount');
  }

  async customers(user: AuthUser) {
    const branches = await this.prisma.branch.findMany({
      where: user.role === Role.OWNER ? {} : { id: user.branchId },
    });
    return Promise.all(branches.map(async (branch) => ({
      branch,
      customerCount: await this.prisma.customer.count({ where: { branchId: branch.id, deletedAt: null } }),
    })));
  }

  async inventory(user: AuthUser) {
    const branches = await this.prisma.branch.findMany({
      where: user.role === Role.OWNER ? {} : { id: user.branchId },
    });
    return Promise.all(branches.map(async (branch) => {
      const balances = await this.prisma.inventoryBalance.findMany({ where: { branchId: branch.id } });
      return {
        branch,
        inventoryValue: balances.reduce((sum, item) => sum + Number(item.totalValueKgs), 0),
        quantity: balances.reduce((sum, item) => sum + item.quantity, 0),
      };
    }));
  }

  private async metric(user: AuthUser, field: 'totalAmount' | 'profitAmount') {
    const branches = await this.prisma.branch.findMany({
      where: user.role === Role.OWNER ? {} : { id: user.branchId },
    });
    return Promise.all(branches.map(async (branch) => {
      const sales = await this.prisma.sale.findMany({
        where: { branchId: branch.id, status: SaleStatus.FINALIZED, deletedAt: null },
        select: { [field]: true },
      });
      return { branch, value: sales.reduce((sum, sale: any) => sum + Number(sale[field]), 0) };
    }));
  }

  private async branchMetrics(branch: any) {
    const [sales, customers, inventory, royalty] = await Promise.all([
      this.prisma.sale.findMany({
        where: { branchId: branch.id, status: SaleStatus.FINALIZED, deletedAt: null },
        select: { totalAmount: true, profitAmount: true },
      }),
      this.prisma.customer.count({ where: { branchId: branch.id, deletedAt: null } }),
      this.prisma.inventoryBalance.findMany({ where: { branchId: branch.id } }),
      this.prisma.royaltyInvoice.findMany({ where: { branchId: branch.id } }),
    ]);
    return {
      branch,
      sales: sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0),
      profit: sales.reduce((sum, sale) => sum + Number(sale.profitAmount), 0),
      repairCount: 0,
      inventoryValue: inventory.reduce((sum, item) => sum + Number(item.totalValueKgs), 0),
      customerGrowth: customers,
      royalty: royalty.reduce((sum, invoice) => sum + Number(invoice.royaltyAmount), 0),
    };
  }
}
