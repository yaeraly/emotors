import { Injectable } from '@nestjs/common';
import { AiInsightType, Role, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  insights(user: AuthUser) {
    return this.prisma.aiInsight.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateInsights(user: AuthUser) {
    const branchWhere = user.role === Role.OWNER ? {} : { branchId: user.branchId };
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
      where: { status: SaleStatus.FINALIZED, ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }) },
      select: { totalAmount: true, branchId: true },
    });
    const total = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    return [{ expectedRevenue: total * 1.1, confidence: 70, branchId: user.role === Role.OWNER ? null : user.branchId }];
  }

  stockRisk(user: AuthUser) {
    return this.prisma.inventoryBalance.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { product: true, branch: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  customerPredictions(user: AuthUser) {
    return this.prisma.customer.findMany({
      where: user.role === Role.OWNER ? { deletedAt: null } : { branchId: user.branchId, deletedAt: null },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });
  }

  kpiRecommendations(user: AuthUser) {
    return this.prisma.kpiRecommendation.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
