import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSalesCommission(tx: PrismaTx, saleId: string) {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { seller: true },
    });
    if (!sale) return null;

    const existing = await tx.salesCommission.findUnique({
      where: { employeeId_saleId: { employeeId: sale.sellerId, saleId } },
    });
    if (existing) return existing;

    const rule = await this.findRule(tx, sale.sellerId, sale.branchId, sale.seller.role);
    const percent = Number(rule?.salesCommissionPercent ?? 0);
    const revenue = Number(sale.totalAmount);
    const commissionAmount = this.roundMoney((revenue * percent) / 100);

    return tx.salesCommission.create({
      data: {
        employeeId: sale.sellerId,
        saleId,
        revenue,
        commissionPercent: percent,
        commissionAmount,
      },
    });
  }

  async createRepairCommission(tx: PrismaTx, serviceOrderId: string) {
    const order = await tx.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      include: { master: true },
    });
    if (!order) return null;

    const existing = await tx.repairCommission.findUnique({
      where: {
        employeeId_serviceOrderId: {
          employeeId: order.masterId,
          serviceOrderId,
        },
      },
    });
    if (existing) return existing;

    const rule = await this.findRule(tx, order.masterId, order.branchId, order.master.role);
    const repairRevenue = Number(order.laborCost);
    const partsRevenue = Number(order.partsCost);
    const repairCommission = (repairRevenue * Number(rule?.repairCommissionPercent ?? 0)) / 100;
    const partsCommission = (partsRevenue * Number(rule?.partsCommissionPercent ?? 0)) / 100;
    const revenue = this.roundMoney(repairRevenue + partsRevenue);
    const commissionAmount = this.roundMoney(repairCommission + partsCommission);
    const commissionPercent = revenue > 0 ? this.roundMoney((commissionAmount / revenue) * 100) : 0;

    return tx.repairCommission.create({
      data: {
        employeeId: order.masterId,
        serviceOrderId,
        revenue,
        commissionPercent,
        commissionAmount,
      },
    });
  }

  createRule(user: AuthUser, dto: any) {
    return this.prisma.employeeCompensationRule.create({
      data: {
        branchId: user.role === Role.OWNER ? dto.branchId ?? user.branchId : user.branchId,
        employeeId: dto.employeeId,
        role: dto.role,
        fixedSalary: Number(dto.fixedSalary ?? 0),
        salesCommissionPercent: Number(dto.salesCommissionPercent ?? 0),
        repairCommissionPercent: Number(dto.repairCommissionPercent ?? 0),
        partsCommissionPercent: Number(dto.partsCommissionPercent ?? 0),
        bonusPercent: Number(dto.bonusPercent ?? 0),
      },
      include: { employee: true, branch: true },
    });
  }

  rules(user: AuthUser) {
    return this.prisma.employeeCompensationRule.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { employee: true, branch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  sales(user: AuthUser) {
    return this.prisma.salesCommission.findMany({
      where: user.role === Role.OWNER ? {} : { employee: { branchId: user.branchId } },
      include: { employee: true, sale: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  repairs(user: AuthUser) {
    return this.prisma.repairCommission.findMany({
      where: user.role === Role.OWNER ? {} : { employee: { branchId: user.branchId } },
      include: { employee: true, serviceOrder: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private findRule(tx: PrismaTx, employeeId: string, branchId: string, role: Role) {
    return tx.employeeCompensationRule.findFirst({
      where: {
        employeeId,
        branchId,
        role,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
