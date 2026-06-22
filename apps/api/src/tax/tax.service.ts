import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role, SaleStatus, TaxReportStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  createProfile(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.taxProfile.create({
      data: {
        branchId,
        taxId: dto.taxId,
        legalName: dto.legalName,
        taxRate: Number(dto.taxRate ?? 0),
        isActive: dto.isActive ?? true,
      },
      include: { branch: true },
    });
  }

  profiles(user: AuthUser) {
    return this.prisma.taxProfile.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { branch: true },
    });
  }

  async generateReport(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const month = dto.month ? new Date(dto.month) : this.monthStart();
    const profile = await this.prisma.taxProfile.findFirst({ where: { branchId, isActive: true } });
    const sales = await this.prisma.sale.findMany({
      where: { branchId, status: SaleStatus.FINALIZED, saleDate: { gte: month } },
      select: { totalAmount: true, profitAmount: true },
    });
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    const profit = sales.reduce((sum, sale) => sum + Number(sale.profitAmount), 0);
    const taxAmount = (revenue * Number(profile?.taxRate ?? dto.taxRate ?? 0)) / 100;
    return this.prisma.taxReport.create({
      data: { branchId, month, revenue, profit, taxAmount, status: TaxReportStatus.READY },
      include: { branch: true },
    });
  }

  reports(user: AuthUser) {
    return this.prisma.taxReport.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { branch: true },
      orderBy: { month: 'desc' },
    });
  }

  createPayment(user: AuthUser, dto: any) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    return this.prisma.taxPayment.create({
      data: {
        branchId,
        reportId: dto.reportId,
        amount: Number(dto.amount ?? 0),
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        note: dto.note,
      },
    });
  }

  reminders(user: AuthUser) {
    return this.prisma.taxReminder.findMany({
      where: user.role === Role.OWNER ? {} : { branchId: user.branchId },
      include: { branch: true },
      orderBy: { dueAt: 'asc' },
    });
  }

  private resolveBranchId(user: AuthUser, branchId?: string) {
    if (user.role === Role.OWNER) return branchId ?? user.branchId;
    if (branchId && branchId !== user.branchId) throw new ForbiddenException('Forbidden branch');
    return user.branchId;
  }

  private monthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}
