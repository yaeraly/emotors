import { Injectable } from '@nestjs/common';
import { AiInsightType, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessAllBranches } from '../rbac/rbac';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  insights(user: AuthUser) {
    return this.prisma.aiInsight.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateInsights(user: AuthUser) {
    const branchWhere = canAccessAllBranches(user.role) ? {} : { branchId: user.branchId };
    const lowStock = await this.prisma.inventoryBalance.findMany({
      where: branchWhere,
      include: { product: true },
      take: 20,
    });
    const created = [];
    for (const item of lowStock.filter((balance) => balance.quantity <= balance.product.minStockLevel)) {
      created.push(await this.prisma.aiInsight.create({
        data: {
          branchId: item.branchId,
          type: AiInsightType.STOCK_RISK,
          title: `Low stock: ${item.product.name}`,
          message: `${item.product.name} is at ${item.quantity}, below or equal minimum ${item.product.minStockLevel}.`,
          score: 90,
        },
      }));
    }
    return created;
  }

  async salesForecast(user: AuthUser) {
    const sales = await this.prisma.sale.findMany({
      where: { status: SaleStatus.FINALIZED, ...(canAccessAllBranches(user.role) ? {} : { branchId: user.branchId }) },
      select: { totalAmount: true, branchId: true },
    });
    const total = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    return [{ expectedRevenue: total * 1.1, confidence: 70, branchId: canAccessAllBranches(user.role) ? null : user.branchId }];
  }

  stockRisk(user: AuthUser) {
    return this.prisma.inventoryBalance.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      include: { product: true, branch: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  customerPredictions(user: AuthUser) {
    return this.prisma.customer.findMany({
      where: canAccessAllBranches(user.role) ? { deletedAt: null } : { branchId: user.branchId, deletedAt: null },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });
  }

  kpiRecommendations(user: AuthUser) {
    return this.prisma.kpiRecommendation.findMany({
      where: canAccessAllBranches(user.role) ? {} : { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
