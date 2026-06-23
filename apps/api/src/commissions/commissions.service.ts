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
    const parts = await tx.partsConsumption.findMany({ where: { serviceOrderId } });
    const partsRevenue = parts.reduce((sum, part) => sum + Number(part.totalPrice), 0);
    const repairCommissionPercent = Number(rule?.repairCommissionPercent ?? 0);
    const partsCommissionPercent = Number(rule?.partsCommissionPercent ?? 0);
    const repairCommission = (repairRevenue * repairCommissionPercent) / 100;
    const partsCommission = (partsRevenue * partsCommissionPercent) / 100;
    const revenue = this.roundMoney(repairRevenue + partsRevenue);
    const commissionAmount = this.roundMoney(repairCommission + partsCommission);
    const commissionPercent = revenue > 0 ? this.roundMoney((commissionAmount / revenue) * 100) : 0;

    return tx.repairCommission.create({
      data: {
        branchId: order.branchId,
        employeeId: order.masterId,
        serviceOrderId,
        revenue,
        commissionPercent,
        commissionAmount,
        repairRevenue,
        partsRevenue,
        repairCommissionPercent,
        partsCommissionPercent,
        repairCommissionAmount: this.roundMoney(repairCommission),
        partsCommissionAmount: this.roundMoney(partsCommission),
        totalCommissionAmount: commissionAmount,
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
        isActive: dto.isActive ?? true,
      },
      include: { employee: true, branch: true },
    });
  }

  rules(user: AuthUser) {
    return this.prisma.employeeCompensationRule.findMany({
      where: {
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }),
      },
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
      where:
        user.role === Role.OWNER
          ? {}
          : user.role === Role.MASTER
            ? { employeeId: user.id }
            : { employee: { branchId: user.branchId } },
      include: { employee: true, serviceOrder: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  repair(user: AuthUser, id: string) {
    return this.prisma.repairCommission.findFirst({
      where: {
        id,
        ...(user.role === Role.OWNER
          ? {}
          : user.role === Role.MASTER
            ? { employeeId: user.id }
            : { employee: { branchId: user.branchId } }),
      },
      include: { employee: true, serviceOrder: true },
    });
  }

  rule(user: AuthUser, id: string) {
    return this.prisma.employeeCompensationRule.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }),
      },
      include: { employee: true, branch: true },
    });
  }

  updateRule(user: AuthUser, id: string, dto: any) {
    return this.prisma.employeeCompensationRule.update({
      where: { id },
      data: {
        fixedSalary: dto.fixedSalary !== undefined ? Number(dto.fixedSalary) : undefined,
        salesCommissionPercent: dto.salesCommissionPercent !== undefined ? Number(dto.salesCommissionPercent) : undefined,
        repairCommissionPercent: dto.repairCommissionPercent !== undefined ? Number(dto.repairCommissionPercent) : undefined,
        partsCommissionPercent: dto.partsCommissionPercent !== undefined ? Number(dto.partsCommissionPercent) : undefined,
        bonusPercent: dto.bonusPercent !== undefined ? Number(dto.bonusPercent) : undefined,
        isActive: dto.isActive,
      },
      include: { employee: true, branch: true },
    });
  }

  deleteRule(_user: AuthUser, id: string) {
    return this.prisma.employeeCompensationRule.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  private findRule(tx: PrismaTx, employeeId: string, branchId: string, role: Role) {
    return tx.employeeCompensationRule.findFirst({
      where: {
        employeeId,
        branchId,
        role,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
