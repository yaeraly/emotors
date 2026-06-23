import { ForbiddenException, Injectable } from '@nestjs/common';
import { BonusType, PayrollStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(user: AuthUser, dto: any) {
    const month = Number(dto.month ?? new Date().getMonth() + 1);
    const year = Number(dto.year ?? new Date().getFullYear());
    const branchId = this.resolveBranchId(user, dto.branchId);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);
    const rules = await this.prisma.employeeCompensationRule.findMany({
      where: user.role === Role.OWNER ? (dto.branchId ? { branchId } : {}) : { branchId },
      include: { employee: true },
    });
    const records = [];

    for (const rule of rules) {
      const [salesCommissions, repairCommissions, bonusRule] = await Promise.all([
        this.prisma.salesCommission.findMany({
          where: { employeeId: rule.employeeId, createdAt: { gte: from, lt: to } },
        }),
        this.prisma.repairCommission.findMany({
          where: { employeeId: rule.employeeId, createdAt: { gte: from, lt: to } },
        }),
        this.prisma.bonusRule.findFirst({
          where: { branchId: rule.branchId, role: rule.role },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const salesCommission = this.sum(salesCommissions.map((item) => item.commissionAmount));
      const repairCommissionTotal = this.sum(repairCommissions.map((item) => item.repairCommissionAmount));
      const partsCommissionTotal = this.sum(repairCommissions.map((item) => item.partsCommissionAmount));
      const repairCommission = this.roundMoney(repairCommissionTotal + partsCommissionTotal);
      const revenue = this.sum(salesCommissions.map((item) => item.revenue));
      const repairRevenue = this.sum(repairCommissions.map((item) => item.revenue));
      const bonus = this.calculateBonus(bonusRule, revenue + repairRevenue);
      const fixedSalary = Number(rule.fixedSalary);
      const deductions = Number(dto.deductions ?? 0);
      const totalPayable = this.roundMoney(fixedSalary + salesCommission + repairCommission + bonus - deductions);

      const record = await this.prisma.payrollRecord.upsert({
        where: { employeeId_payrollMonth_payrollYear: { employeeId: rule.employeeId, payrollMonth: month, payrollYear: year } },
        create: {
          branchId: rule.branchId,
          employeeId: rule.employeeId,
          month,
          year,
          payrollMonth: month,
          payrollYear: year,
          fixedSalary,
          salesCommission,
          repairCommission,
          repairCommissionTotal,
          partsCommissionTotal,
          salesCommissionTotal: salesCommission,
          bonus,
          bonusAmount: bonus,
          deductions,
          totalPayable,
          status: PayrollStatus.DRAFT,
        },
        update: {
          branchId: rule.branchId,
          month,
          year,
          fixedSalary,
          salesCommission,
          repairCommission,
          repairCommissionTotal,
          partsCommissionTotal,
          salesCommissionTotal: salesCommission,
          bonus,
          bonusAmount: bonus,
          deductions,
          totalPayable,
        },
        include: { employee: true },
      });
      await this.prisma.employeeKPI.upsert({
        where: { employeeId_month_year: { employeeId: rule.employeeId, month, year } },
        create: { employeeId: rule.employeeId, month, year, revenue, repairRevenue, repairsCount: repairCommissions.length, planAchievement: Number(bonusRule?.targetRevenue ?? 0) > 0 ? ((revenue + repairRevenue) / Number(bonusRule?.targetRevenue)) * 100 : 0 },
        update: { revenue, repairRevenue, repairsCount: repairCommissions.length, planAchievement: Number(bonusRule?.targetRevenue ?? 0) > 0 ? ((revenue + repairRevenue) / Number(bonusRule?.targetRevenue)) * 100 : 0 },
      });
      records.push(record);
    }

    return records;
  }

  list(user: AuthUser) {
    return this.prisma.payrollRecord.findMany({
      where: {
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { employee: { branchId: user.branchId } }),
      },
      include: { employee: true },
      orderBy: [{ payrollYear: 'desc' }, { payrollMonth: 'desc' }],
    });
  }

  detail(user: AuthUser, id: string) {
    return this.prisma.payrollRecord.findFirst({
      where: { id, ...(user.role === Role.OWNER ? {} : { employee: { branchId: user.branchId } }) },
      include: { employee: true },
    });
  }

  approve(user: AuthUser, id: string) {
    return this.prisma.payrollRecord.update({
      where: { id },
      data: { status: PayrollStatus.APPROVED },
      include: { employee: true },
    });
  }

  markPaid(user: AuthUser, id: string) {
    return this.prisma.payrollRecord.update({
      where: { id },
      data: { status: PayrollStatus.PAID, paidAt: new Date() },
      include: { employee: true },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private calculateBonus(rule: any, revenue: number) {
    if (!rule || revenue < Number(rule.targetRevenue ?? 0)) return 0;
    if (rule.bonusType === BonusType.PERCENT) return this.roundMoney((revenue * Number(rule.bonusValue ?? 0)) / 100);
    return Number(rule.bonusValue ?? 0);
  }

  private sum(values: Prisma.Decimal[]) {
    return this.roundMoney(values.reduce((sum, value) => sum + Number(value), 0));
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
