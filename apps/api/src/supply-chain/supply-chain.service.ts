import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isFullAccessRole } from '../rbac/rbac';

@Injectable()
export class SupplyChainService {
  constructor(private readonly prisma: PrismaService) {}

  createTransfer(user: AuthUser, dto: any) {
    return this.prisma.stockTransfer.create({
      data: {
        fromBranchId: dto.fromBranchId,
        toBranchId: this.canAccessAllSupplyChain(user) ? dto.toBranchId : user.branchId,
        status: dto.status,
        note: dto.note,
        items: { create: (dto.items ?? []).map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          quantity: Number(item.quantity ?? 0),
        })) },
      },
      include: { fromBranch: true, toBranch: true, items: true },
    });
  }

  transfers(user: AuthUser) {
    return this.prisma.stockTransfer.findMany({
      where: this.canAccessAllSupplyChain(user) ? {} : { toBranchId: user.branchId },
      include: { fromBranch: true, toBranch: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createStockRequest(user: AuthUser, dto: any) {
    return this.prisma.branchStockRequest.create({
      data: {
        branchId: this.canAccessAllSupplyChain(user) ? dto.branchId ?? user.branchId : user.branchId,
        productId: dto.productId,
        productName: dto.productName,
        sku: dto.sku,
        quantity: Number(dto.quantity ?? 0),
        status: dto.status,
        note: dto.note,
      },
      include: { branch: true },
    });
  }

  stockRequests(user: AuthUser) {
    return this.prisma.branchStockRequest.findMany({
      where: this.canAccessAllSupplyChain(user) ? {} : { branchId: user.branchId },
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async forecast(user: AuthUser) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: this.canAccessAllSupplyChain(user) ? {} : { branchId: user.branchId },
      include: { product: true, branch: true },
    });
    return balances.map((balance) => ({
      branch: balance.branch,
      productName: balance.product.name,
      currentQuantity: balance.quantity,
      forecastDemand: Math.max(balance.product.minStockLevel * 2, 1),
      riskLevel: balance.quantity <= balance.product.minStockLevel ? 'HIGH' : 'NORMAL',
    }));
  }

  async recommendations(user: AuthUser) {
    const forecast = await this.forecast(user);
    return forecast.filter((item) => item.riskLevel === 'HIGH').map((item) => ({
      ...item,
      recommendation: `Transfer or reorder ${item.productName}`,
    }));
  }

  private canAccessAllSupplyChain(user: AuthUser) {
    return isFullAccessRole(user.role) || user.role === Role.SUPPLY_CHAIN_MANAGER;
  }
}
