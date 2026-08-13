import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoyaltyInvoiceStatus, RoyaltyRuleType, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessAllBranches } from '../rbac/rbac';

@Injectable()
export class RoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  createRule(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.royaltyRule.create({
      data: {
        branchId,
        type: dto.type,
        percent: dto.percent,
        fixedAmount: dto.fixedAmount,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
    });
  }

  rules(user: AuthUser) {
    return this.prisma.royaltyRule.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateMonthly(user: AuthUser, dto: any) {
    const month = dto.month ? new Date(dto.month) : this.monthStart();
    const branches = await this.prisma.branch.findMany({
      where: canAccessAllBranches(user.role) ? {} : { id: user.branchId },
      include: { royaltyRules: { where: { isActive: true } } },
    });
    const invoices = [];

    for (const branch of branches) {
      const sales = await this.prisma.sale.findMany({
        where: { branchId: branch.id, status: SaleStatus.FINALIZED, saleDate: { gte: month } },
        select: { totalAmount: true, profitAmount: true },
      });
      const revenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
      const profit = sales.reduce((sum, sale) => sum + Number(sale.profitAmount), 0);
      const rule = branch.royaltyRules[0];
      if (!rule) continue;
      const royaltyAmount =
        rule.type === RoyaltyRuleType.FIXED_MONTHLY
          ? Number(rule.fixedAmount ?? 0)
          : rule.type === RoyaltyRuleType.PERCENT_OF_PROFIT
            ? (profit * Number(rule.percent ?? 0)) / 100
            : (revenue * Number(rule.percent ?? 0)) / 100;
      invoices.push(await this.prisma.royaltyInvoice.create({
        data: {
          branchId: branch.id,
          month,
          revenue,
          profit,
          royaltyAmount,
          status: RoyaltyInvoiceStatus.ISSUED,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : new Date(month.getFullYear(), month.getMonth() + 1, 10),
          createdById: user.id,
        },
      }));
    }

    return invoices;
  }

  invoices(user: AuthUser) {
    return this.prisma.royaltyInvoice.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      include: { branch: true, payments: true },
      orderBy: { month: 'desc' },
    });
  }

  async pay(user: AuthUser, id: string, dto: any) {
    const invoice = await this.prisma.royaltyInvoice.findFirst({
      where: { id, ...(canAccessAllBranches(user.role) ? {} : { branchId: user.branchId }) },
    });
    if (!invoice) throw new ForbiddenException('Invoice not found');
    await this.prisma.royaltyPayment.create({
      data: {
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        amount: Number(dto.amount ?? invoice.royaltyAmount),
        note: dto.note,
        createdById: user.id,
      },
    });
    return this.prisma.royaltyInvoice.update({
      where: { id },
      data: { status: RoyaltyInvoiceStatus.PAID },
      include: { payments: true, branch: true },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (canAccessAllBranches(user.role)) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private monthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}
