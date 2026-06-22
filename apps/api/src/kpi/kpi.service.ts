import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser) {
    const branches = await this.accessibleBranches(user);
    const comparison = await this.branchComparison(user);
    return { branches, comparison };
  }

  async branchKpi(user: AuthUser, branchId: string) {
    this.ensureBranchAccess(user, branchId);
    const [customers, newCustomers, sales, inventory, nps] = await Promise.all([
      this.prisma.customer.count({ where: { branchId, deletedAt: null } }),
      this.prisma.customer.count({
        where: {
          branchId,
          deletedAt: null,
          createdAt: { gte: this.monthStart() },
        },
      }),
      this.prisma.sale.findMany({
        where: { branchId, deletedAt: null, status: SaleStatus.FINALIZED },
        select: { totalAmount: true, profitAmount: true, debtAmount: true, customerId: true },
      }),
      this.prisma.inventoryBalance.findMany({
        where: { branchId },
        select: { quantity: true, totalValueKgs: true, product: { select: { minStockLevel: true } } },
      }),
      this.prisma.npsSurvey.aggregate({
        where: { branchId },
        _avg: { score: true },
      }),
    ]);
    const uniqueCustomers = new Set(sales.map((sale) => sale.customerId));
    return {
      branchId,
      totalSales: this.sum(sales.map((sale) => sale.totalAmount)),
      totalProfit: this.sum(sales.map((sale) => sale.profitAmount)),
      totalRepairs: 0,
      averageRepairTime: 0,
      inventoryValue: this.sum(inventory.map((item) => item.totalValueKgs)),
      lowStockCount: inventory.filter((item) => item.quantity <= item.product.minStockLevel).length,
      customerCount: customers,
      newCustomers,
      repeatCustomers: Math.max(uniqueCustomers.size - newCustomers, 0),
      debtAmount: this.sum(sales.map((sale) => sale.debtAmount)),
      npsScore: nps._avg.score ?? 0,
    };
  }

  createTarget(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.branchKpiTarget.create({
      data: {
        branchId,
        metric: dto.metric,
        targetValue: Number(dto.targetValue ?? 0),
        month: dto.month ? new Date(dto.month) : this.monthStart(),
        createdById: user.id,
      },
    });
  }

  async branchComparison(user: AuthUser) {
    const branches = await this.accessibleBranches(user);
    return Promise.all(
      branches.map(async (branch) => ({
        branch,
        kpi: await this.branchKpi(user, branch.id),
      })),
    );
  }

  createNps(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.npsSurvey.create({
      data: {
        branchId,
        customerId: dto.customerId,
        score: Number(dto.score),
        comment: dto.comment,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : new Date(),
        createdById: user.id,
      },
    });
  }

  private accessibleBranches(user: AuthUser) {
    return this.prisma.branch.findMany({
      where: user.role === Role.OWNER ? {} : { id: user.branchId },
      orderBy: { name: 'asc' },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private ensureBranchAccess(user: AuthUser, branchId: string) {
    if (user.role !== Role.OWNER && user.branchId !== branchId) throw new ForbiddenException('Forbidden branch');
  }

  private monthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private sum(values: Prisma.Decimal[]) {
    return values.reduce((sum, value) => sum + Number(value), 0);
  }
}
