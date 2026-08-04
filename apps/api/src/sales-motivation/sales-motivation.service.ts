import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FullPaymentBonusTrigger,
  InstallmentBonusTrigger,
  PaymentStatus,
  Prisma,
  Role,
  SalePaymentType,
  SaleStatus,
  SalesBonusKind,
  SalesBonusStatus,
  SalesMotivationBonusType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isBranchOwnerUser, isBranchSalesManagerUser } from '../rbac/rbac';
import { SaveSalesMotivationDto } from './dto/save-sales-motivation.dto';
import {
  buildSmartRecommendations,
  EMOTORS_DEFAULT_MOTIVATION,
  estimateMonthlyBonusImpact,
  type BranchSalesStats,
} from './sales-motivation-defaults';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class SalesMotivationService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveSettings(user: AuthUser) {
    const branchId = this.requireBranchCeo(user);
    const active = await this.prisma.salesMotivationSettingsVersion.findFirst({
      where: { branchId, isActive: true },
      include: this.versionInclude(),
      orderBy: { version: 'desc' },
    });
    if (!active) {
      return {
        settings: null,
        defaults: EMOTORS_DEFAULT_MOTIVATION,
      };
    }
    return { settings: this.toVersionResponse(active), defaults: EMOTORS_DEFAULT_MOTIVATION };
  }

  async listVersions(user: AuthUser) {
    const branchId = this.requireBranchCeo(user);
    const versions = await this.prisma.salesMotivationSettingsVersion.findMany({
      where: { branchId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { version: 'desc' },
    });
    return versions.map((version) => ({
      id: version.id,
      version: version.version,
      isActive: version.isActive,
      comment: version.comment,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      recommendationSource: version.recommendationSource,
    }));
  }

  async getVersion(user: AuthUser, versionId: string) {
    const branchId = this.requireBranchCeo(user);
    const version = await this.prisma.salesMotivationSettingsVersion.findFirst({
      where: { id: versionId, branchId },
      include: this.versionInclude(),
    });
    if (!version) throw new NotFoundException('Motivation version not found');
    return this.toVersionResponse(version);
  }

  async getRecommendations(user: AuthUser) {
    const branchId = this.requireBranchCeo(user);
    const stats = await this.collectBranchStats(branchId);
    const recommendation = buildSmartRecommendations(stats);
    const impact = estimateMonthlyBonusImpact({
      monthlySalesAverage: stats.monthlySalesAverage || 1_000_000,
      fullPaymentShare: Math.max(0, 100 - stats.installmentSharePercent),
      installmentShare: stats.installmentSharePercent,
      values: recommendation.values,
    });
    return {
      stats,
      recommendation,
      impact,
      sections: this.buildRecommendationCards(recommendation, impact),
    };
  }

  async saveVersion(user: AuthUser, dto: SaveSalesMotivationDto) {
    const branchId = this.requireBranchCeo(user);
    this.validateDto(dto);

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.salesMotivationSettingsVersion.findFirst({
        where: { branchId },
        orderBy: { version: 'desc' },
        include: this.versionInclude(),
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.salesMotivationSettingsVersion.updateMany({
        where: { branchId, isActive: true },
        data: { isActive: false },
      });

      const created = await tx.salesMotivationSettingsVersion.create({
        data: {
          branchId,
          version: nextVersion,
          isActive: true,
          comment: dto.comment,
          createdById: user.id,
          fullPaymentCommissionPercent: dto.fullPaymentCommissionPercent,
          fullPaymentMinCommission: dto.fullPaymentMinCommission,
          fullPaymentMaxCommission: dto.fullPaymentMaxCommission ?? null,
          fullPaymentEffectiveFrom: new Date(dto.fullPaymentEffectiveFrom),
          fullPaymentTrigger: dto.fullPaymentTrigger,
          installmentApprovalCommissionPercent: dto.installmentApprovalCommissionPercent,
          installmentRepaymentCommissionPercent: dto.installmentRepaymentCommissionPercent,
          installmentEffectiveFrom: new Date(dto.installmentEffectiveFrom),
          installmentTrigger: dto.installmentTrigger,
          returningCustomerDays: dto.returningCustomerDays,
          returningCustomerBonusType: dto.returningCustomerBonusType,
          returningCustomerFixedAmount: dto.returningCustomerFixedAmount ?? null,
          returningCustomerPercent: dto.returningCustomerPercent ?? null,
          averageReceiptMinCount: dto.averageReceiptMinCount,
          recommendationSource: dto.recommendationSource,
          planLevels: {
            create: dto.planLevels.map((level, index) => ({
              salesThreshold: level.salesThreshold,
              bonusAmount: level.bonusAmount,
              sortOrder: index,
            })),
          },
          averageReceiptLevels: {
            create: dto.averageReceiptLevels.map((level, index) => ({
              averageReceiptThreshold: level.averageReceiptThreshold,
              bonusAmount: level.bonusAmount,
              sortOrder: index,
            })),
          },
        },
        include: this.versionInclude(),
      });

      await this.auditInTx(
        tx,
        user,
        branchId,
        latest ? 'SALES_MOTIVATION_UPDATED' : 'SALES_MOTIVATION_CREATED',
        'SalesMotivationSettingsVersion',
        created.id,
        {
          versionId: created.id,
          version: created.version,
          oldValues: latest ? this.toVersionResponse(latest) : null,
          changedValues: this.toVersionResponse(created),
          recommendationSource: dto.recommendationSource ?? null,
        },
      );

      return this.toVersionResponse(created);
    });
  }

  async applyRecommendation(user: AuthUser, comment?: string) {
    const branchId = this.requireBranchCeo(user);
    const payload = await this.getRecommendations(user);
    const values = payload.recommendation.values;
    const now = new Date().toISOString();
    const saved = await this.saveVersion(user, {
      ...values,
      fullPaymentEffectiveFrom: now,
      installmentEffectiveFrom: now,
      comment: comment ?? 'Применена рекомендация EMOTORS',
      recommendationSource: payload.recommendation.source,
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'SALES_RECOMMENDATION_APPLIED',
        entity: 'SalesMotivationSettingsVersion',
        entityId: saved.id,
        metadata: {
          branchId,
          versionId: saved.id,
          recommendationSource: payload.recommendation.source,
          timestamp: new Date().toISOString(),
        },
      },
    });
    return { settings: saved, recommendation: payload.recommendation, impact: payload.impact };
  }

  async calculateBonuses(user: AuthUser, period?: { month?: number; year?: number }) {
    const branchId = this.requireBranchCeo(user);
    const settings = await this.prisma.salesMotivationSettingsVersion.findFirst({
      where: { branchId, isActive: true },
      include: this.versionInclude(),
    });
    if (!settings) throw new BadRequestException('Motivation settings are not configured');
    const planLevels = settings.planLevels;
    const averageReceiptLevels = settings.averageReceiptLevels;

    const now = new Date();
    const month = period?.month ?? now.getMonth() + 1;
    const year = period?.year ?? now.getFullYear();
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);

    const sellers = await this.prisma.user.findMany({
      where: {
        branchId,
        OR: [
          { role: Role.MANAGER },
          { userRoles: { some: { role: { code: Role.MANAGER } } } },
        ],
        deletedAt: null,
      },
      select: { id: true, fullName: true },
    });

    const created: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const seller of sellers) {
        const sales = await tx.sale.findMany({
          where: {
            branchId,
            sellerId: seller.id,
            deletedAt: null,
            saleDate: { gte: from, lt: to },
            status: SaleStatus.FINALIZED,
          },
          include: {
            customer: { select: { id: true, fullName: true } },
            installmentApproval: true,
          },
        });

        for (const sale of sales) {
          const existing = await tx.salesBonusAccrual.findFirst({
            where: {
              saleId: sale.id,
              employeeId: seller.id,
              kind: {
                in: [
                  SalesBonusKind.FULL_PAYMENT_COMMISSION,
                  SalesBonusKind.INSTALLMENT_APPROVAL_COMMISSION,
                  SalesBonusKind.INSTALLMENT_REPAYMENT_COMMISSION,
                ],
              },
            },
          });
          if (existing) continue;

          const isInstallment =
            sale.paymentType === SalePaymentType.INSTALLMENT || Boolean(sale.installmentApproval);
          if (!isInstallment && sale.paymentStatus === PaymentStatus.PAID) {
            const amount = this.commissionAmount(
              Number(sale.totalAmount),
              Number(settings.fullPaymentCommissionPercent),
              Number(settings.fullPaymentMinCommission),
              settings.fullPaymentMaxCommission != null
                ? Number(settings.fullPaymentMaxCommission)
                : null,
            );
            const row = await tx.salesBonusAccrual.create({
              data: {
                branchId,
                versionId: settings.id,
                employeeId: seller.id,
                saleId: sale.id,
                kind: SalesBonusKind.FULL_PAYMENT_COMMISSION,
                saleAmount: sale.totalAmount,
                commissionPercent: settings.fullPaymentCommissionPercent,
                commissionAmount: amount,
                status: SalesBonusStatus.ACCRUED,
                saleDate: sale.saleDate,
                paymentType: sale.paymentType ?? SalePaymentType.FULL_PAYMENT,
                customerId: sale.customerId,
                customerName: sale.customer.fullName,
                receiptNumber: sale.receiptNumber,
                comment: `Комиссия полной оплаты ${settings.fullPaymentCommissionPercent}%`,
              },
            });
            created.push(row.id);
          }

          if (isInstallment) {
            const approvalAmount = this.commissionAmount(
              Number(sale.totalAmount),
              Number(settings.installmentApprovalCommissionPercent),
              0,
              null,
            );
            const approval = await tx.salesBonusAccrual.create({
              data: {
                branchId,
                versionId: settings.id,
                employeeId: seller.id,
                saleId: sale.id,
                kind: SalesBonusKind.INSTALLMENT_APPROVAL_COMMISSION,
                saleAmount: sale.totalAmount,
                commissionPercent: settings.installmentApprovalCommissionPercent,
                commissionAmount: approvalAmount,
                status: SalesBonusStatus.PENDING,
                saleDate: sale.saleDate,
                paymentType: 'INSTALLMENT',
                customerId: sale.customerId,
                customerName: sale.customer.fullName,
                receiptNumber: sale.receiptNumber,
                comment: 'Комиссия после одобрения рассрочки',
              },
            });
            created.push(approval.id);

            if (sale.paymentStatus === PaymentStatus.PAID) {
              const repaymentAmount = this.commissionAmount(
                Number(sale.totalAmount),
                Number(settings.installmentRepaymentCommissionPercent),
                0,
                null,
              );
              const repayment = await tx.salesBonusAccrual.create({
                data: {
                  branchId,
                  versionId: settings.id,
                  employeeId: seller.id,
                  saleId: sale.id,
                  kind: SalesBonusKind.INSTALLMENT_REPAYMENT_COMMISSION,
                  saleAmount: sale.totalAmount,
                  commissionPercent: settings.installmentRepaymentCommissionPercent,
                  commissionAmount: repaymentAmount,
                  status: SalesBonusStatus.ACCRUED,
                  saleDate: sale.saleDate,
                  paymentType: 'INSTALLMENT',
                  customerId: sale.customerId,
                  customerName: sale.customer.fullName,
                  receiptNumber: sale.receiptNumber,
                  comment: 'Комиссия после полного погашения',
                },
              });
              created.push(repayment.id);
            }
          }
        }

        const monthSalesTotal = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
        const matchedPlan = [...planLevels]
          .sort((a, b) => Number(b.salesThreshold) - Number(a.salesThreshold))
          .find((level) => monthSalesTotal >= Number(level.salesThreshold));
        if (matchedPlan) {
          const existingPlan = await tx.salesBonusAccrual.findFirst({
            where: {
              branchId,
              employeeId: seller.id,
              kind: SalesBonusKind.MONTHLY_PLAN,
              calculatedAt: { gte: from, lt: to },
            },
          });
          if (!existingPlan) {
            const row = await tx.salesBonusAccrual.create({
              data: {
                branchId,
                versionId: settings.id,
                employeeId: seller.id,
                kind: SalesBonusKind.MONTHLY_PLAN,
                saleAmount: monthSalesTotal,
                commissionAmount: matchedPlan.bonusAmount,
                status: SalesBonusStatus.ACCRUED,
                comment: `План продаж ${matchedPlan.salesThreshold}`,
              },
            });
            created.push(row.id);
          }
        }

        if (sales.length >= settings.averageReceiptMinCount) {
          const averageReceipt =
            sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0) / sales.length;
          const matchedAvg = [...averageReceiptLevels]
            .sort((a, b) => Number(b.averageReceiptThreshold) - Number(a.averageReceiptThreshold))
            .find((level) => averageReceipt >= Number(level.averageReceiptThreshold));
          if (matchedAvg) {
            const existingAvg = await tx.salesBonusAccrual.findFirst({
              where: {
                branchId,
                employeeId: seller.id,
                kind: SalesBonusKind.AVERAGE_RECEIPT,
                calculatedAt: { gte: from, lt: to },
              },
            });
            if (!existingAvg) {
              const row = await tx.salesBonusAccrual.create({
                data: {
                  branchId,
                  versionId: settings.id,
                  employeeId: seller.id,
                  kind: SalesBonusKind.AVERAGE_RECEIPT,
                  saleAmount: averageReceipt,
                  commissionAmount: matchedAvg.bonusAmount,
                  status: SalesBonusStatus.ACCRUED,
                  comment: `Средний чек ${Math.round(averageReceipt)} / мин. чеков ${settings.averageReceiptMinCount}`,
                },
              });
              created.push(row.id);
            }
          }
        }
      }

      await this.auditInTx(tx, user, branchId, 'BONUS_CALCULATED', 'SalesBonusAccrual', branchId, {
        createdCount: created.length,
        month,
        year,
        versionId: settings.id,
      });
    });

    return { createdCount: created.length, month, year };
  }

  async ceoDashboard(user: AuthUser, sortBy = 'sales') {
    const branchId = this.requireBranchCeo(user);
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const sellers = await this.prisma.user.findMany({
      where: {
        branchId,
        OR: [
          { role: Role.MANAGER },
          { userRoles: { some: { role: { code: Role.MANAGER } } } },
        ],
        deletedAt: null,
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    const settings = await this.prisma.salesMotivationSettingsVersion.findFirst({
      where: { branchId, isActive: true },
      include: { planLevels: { orderBy: { sortOrder: 'asc' } } },
    });
    const topPlan = settings?.planLevels?.[settings.planLevels.length - 1];

    const rows = [];
    for (const seller of sellers) {
      const sales = await this.prisma.sale.findMany({
        where: {
          branchId,
          sellerId: seller.id,
          deletedAt: null,
          saleDate: { gte: from },
        },
        select: { totalAmount: true, customerId: true },
      });
      const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
      const averageReceipt = sales.length ? salesTotal / sales.length : 0;
      const uniqueCustomers = new Set(sales.map((sale) => sale.customerId)).size;
      const bonuses = await this.prisma.salesBonusAccrual.findMany({
        where: { branchId, employeeId: seller.id, calculatedAt: { gte: from } },
      });
      const accrued = this.sumByStatus(bonuses, [
        SalesBonusStatus.ACCRUED,
        SalesBonusStatus.PENDING,
        SalesBonusStatus.APPROVED,
        SalesBonusStatus.PAID,
      ]);
      const paid = this.sumByStatus(bonuses, [SalesBonusStatus.PAID]);
      const pending = this.sumByStatus(bonuses, [SalesBonusStatus.PENDING, SalesBonusStatus.ACCRUED]);
      const planTarget = topPlan ? Number(topPlan.salesThreshold) : 0;
      rows.push({
        employeeId: seller.id,
        employeeName: seller.fullName,
        sales: Math.round(salesTotal * 100) / 100,
        plan: planTarget,
        planPercent: planTarget > 0 ? Math.round((salesTotal / planTarget) * 10000) / 100 : 0,
        averageReceipt: Math.round(averageReceipt * 100) / 100,
        repeatCustomers: uniqueCustomers,
        commission: Math.round(accrued * 100) / 100,
        accrued: Math.round(accrued * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        pending: Math.round(pending * 100) / 100,
      });
    }

    rows.sort((a, b) => {
      if (sortBy === 'bonuses') return b.accrued - a.accrued;
      if (sortBy === 'averageReceipt') return b.averageReceipt - a.averageReceipt;
      if (sortBy === 'repeatCustomers') return b.repeatCustomers - a.repeatCustomers;
      if (sortBy === 'plan') return b.planPercent - a.planPercent;
      return b.sales - a.sales;
    });

    return { sellers: rows, settingsVersionId: settings?.id ?? null };
  }

  async myBonuses(user: AuthUser) {
    if (!isBranchSalesManagerUser(user) && !isBranchOwnerUser(user)) {
      throw new ForbiddenException('Only Branch Sales can view personal bonuses');
    }
    if (!user.branchId) throw new ForbiddenException('Branch access required');
    const employeeId = user.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todaySales, monthSales, bonuses, settings] = await Promise.all([
      this.prisma.sale.findMany({
        where: { sellerId: employeeId, branchId: user.branchId, deletedAt: null, saleDate: { gte: startOfDay } },
        select: { totalAmount: true, customerId: true },
      }),
      this.prisma.sale.findMany({
        where: { sellerId: employeeId, branchId: user.branchId, deletedAt: null, saleDate: { gte: startOfMonth } },
        select: { totalAmount: true, customerId: true, paymentType: true },
      }),
      this.prisma.salesBonusAccrual.findMany({
        where: { employeeId, branchId: user.branchId },
        orderBy: { calculatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.salesMotivationSettingsVersion.findFirst({
        where: { branchId: user.branchId, isActive: true },
        include: { planLevels: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

    const monthSalesTotal = monthSales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    const averageReceipt = monthSales.length ? monthSalesTotal / monthSales.length : 0;
    const topPlan = settings?.planLevels?.[settings.planLevels.length - 1];

    return {
      summary: {
        today: Math.round(todaySales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0) * 100) / 100,
        thisMonth: Math.round(monthSalesTotal * 100) / 100,
        accrued: this.sumByStatus(bonuses, [SalesBonusStatus.ACCRUED, SalesBonusStatus.APPROVED, SalesBonusStatus.PAID]),
        pending: this.sumByStatus(bonuses, [SalesBonusStatus.PENDING, SalesBonusStatus.ACCRUED]),
        approved: this.sumByStatus(bonuses, [SalesBonusStatus.APPROVED]),
        paid: this.sumByStatus(bonuses, [SalesBonusStatus.PAID]),
        salesPlan: topPlan ? Number(topPlan.salesThreshold) : 0,
        averageReceipt: Math.round(averageReceipt * 100) / 100,
        repeatCustomers: new Set(monthSales.map((sale) => sale.customerId)).size,
        fullPaymentCommissionPercent: settings ? Number(settings.fullPaymentCommissionPercent) : null,
        installmentApprovalCommissionPercent: settings
          ? Number(settings.installmentApprovalCommissionPercent)
          : null,
        installmentRepaymentCommissionPercent: settings
          ? Number(settings.installmentRepaymentCommissionPercent)
          : null,
      },
      items: bonuses
        .filter((bonus) => bonus.employeeId === employeeId)
        .map((bonus) => ({
          id: bonus.id,
          date: bonus.saleDate ?? bonus.calculatedAt,
          receiptNumber: bonus.receiptNumber,
          customerName: bonus.customerName,
          saleAmount: Number(bonus.saleAmount),
          paymentType: bonus.paymentType,
          commissionPercent: bonus.commissionPercent != null ? Number(bonus.commissionPercent) : null,
          commissionAmount: Number(bonus.commissionAmount),
          status: bonus.status,
          comment: bonus.comment,
          kind: bonus.kind,
        })),
    };
  }

  async updateBonusStatus(user: AuthUser, bonusId: string, status: SalesBonusStatus) {
    const branchId = this.requireBranchCeo(user);
    const bonus = await this.prisma.salesBonusAccrual.findFirst({
      where: { id: bonusId, branchId },
    });
    if (!bonus) throw new NotFoundException('Bonus not found');
    const allowed: SalesBonusStatus[] = [
      SalesBonusStatus.APPROVED,
      SalesBonusStatus.PAID,
      SalesBonusStatus.CANCELLED,
    ];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Unsupported status');
    }
    const updated = await this.prisma.salesBonusAccrual.update({
      where: { id: bonusId },
      data: {
        status,
        approvedAt: status === SalesBonusStatus.APPROVED ? new Date() : bonus.approvedAt,
        paidAt: status === SalesBonusStatus.PAID ? new Date() : bonus.paidAt,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: status === SalesBonusStatus.PAID ? 'BONUS_PAID' : 'BONUS_APPROVED',
        entity: 'SalesBonusAccrual',
        entityId: bonusId,
        metadata: {
          branchId,
          versionId: bonus.versionId,
          employeeId: bonus.employeeId,
          status,
          timestamp: new Date().toISOString(),
        },
      },
    });
    return updated;
  }

  private async collectBranchStats(branchId: string): Promise<BranchSalesStats> {
    const now = new Date();
    const from6 = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const from3 = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const sales6 = await this.prisma.sale.findMany({
      where: {
        branchId,
        deletedAt: null,
        saleDate: { gte: from6 },
        status: { notIn: [SaleStatus.DRAFT, SaleStatus.CANCELLED] },
      },
      select: {
        totalAmount: true,
        paymentType: true,
        customerId: true,
        saleDate: true,
      },
    });
    const sales3 = sales6.filter((sale) => sale.saleDate >= from3);
    const analyzed = sales3.length >= 10 ? sales3 : sales6;
    const monthsAnalyzed = sales3.length >= 10 ? 3 : 6;
    const completedSalesCount = analyzed.length;
    const total = analyzed.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
    const monthlySalesAverage = completedSalesCount
      ? total / Math.max(monthsAnalyzed, 1)
      : 0;
    const averageReceipt = completedSalesCount ? total / completedSalesCount : 0;
    const installmentCount = analyzed.filter(
      (sale) => sale.paymentType === SalePaymentType.INSTALLMENT,
    ).length;
    const installmentSharePercent = completedSalesCount
      ? (installmentCount / completedSalesCount) * 100
      : 0;

    const customerFirstSale = new Map<string, Date>();
    for (const sale of [...analyzed].sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime())) {
      if (!customerFirstSale.has(sale.customerId)) {
        customerFirstSale.set(sale.customerId, sale.saleDate);
      }
    }
    let repeat = 0;
    for (const sale of analyzed) {
      const first = customerFirstSale.get(sale.customerId);
      if (first && sale.saleDate.getTime() - first.getTime() >= 30 * 24 * 60 * 60 * 1000) {
        repeat += 1;
      }
    }
    const repeatCustomerRatePercent = completedSalesCount ? (repeat / completedSalesCount) * 100 : 0;
    return {
      monthsAnalyzed,
      completedSalesCount,
      monthlySalesAverage: Math.round(monthlySalesAverage * 100) / 100,
      averageReceipt: Math.round(averageReceipt * 100) / 100,
      installmentSharePercent: Math.round(installmentSharePercent * 100) / 100,
      repeatCustomerRatePercent: Math.round(repeatCustomerRatePercent * 100) / 100,
      sufficient: completedSalesCount >= 10,
    };
  }

  private buildRecommendationCards(
    recommendation: ReturnType<typeof buildSmartRecommendations>,
    impact: ReturnType<typeof estimateMonthlyBonusImpact>,
  ) {
    const values = recommendation.values;
    return [
      {
        section: 'fullPayment',
        title: 'Комиссия полной оплаты',
        recommendedValues: { commissionPercent: values.fullPaymentCommissionPercent },
        why: recommendation.reasons.fullPayment,
        impact,
      },
      {
        section: 'installment',
        title: 'Комиссия рассрочки',
        recommendedValues: {
          afterApproval: values.installmentApprovalCommissionPercent,
          afterFullRepayment: values.installmentRepaymentCommissionPercent,
        },
        why: recommendation.reasons.installment,
        impact,
      },
      {
        section: 'monthlyPlan',
        title: 'Ежемесячный план продаж',
        recommendedValues: { levels: values.planLevels },
        why: recommendation.reasons.plan,
        impact,
      },
      {
        section: 'averageReceipt',
        title: 'Бонус среднего чека',
        recommendedValues: {
          minReceipts: values.averageReceiptMinCount,
          levels: values.averageReceiptLevels,
        },
        why: recommendation.reasons.averageReceipt,
        impact,
      },
      {
        section: 'returningCustomer',
        title: 'Бонус повторного клиента',
        recommendedValues: {
          days: values.returningCustomerDays,
          bonusType: values.returningCustomerBonusType,
          fixedAmount: values.returningCustomerFixedAmount,
          percent: values.returningCustomerPercent,
        },
        why: recommendation.reasons.returningCustomer,
        impact,
      },
    ];
  }

  private validateDto(dto: SaveSalesMotivationDto) {
    if (dto.returningCustomerBonusType === SalesMotivationBonusType.FIXED) {
      if (dto.returningCustomerFixedAmount == null) {
        throw new BadRequestException('Fixed returning-customer amount is required');
      }
    } else if (dto.returningCustomerPercent == null) {
      throw new BadRequestException('Returning-customer percent is required');
    }
    if (
      dto.fullPaymentMaxCommission != null &&
      dto.fullPaymentMaxCommission < dto.fullPaymentMinCommission
    ) {
      throw new BadRequestException('Max commission cannot be below min commission');
    }
  }

  private commissionAmount(
    saleAmount: number,
    percent: number,
    minAmount: number,
    maxAmount: number | null,
  ) {
    let amount = Math.round(((saleAmount * percent) / 100 + Number.EPSILON) * 100) / 100;
    if (amount < minAmount) amount = minAmount;
    if (maxAmount != null && amount > maxAmount) amount = maxAmount;
    return amount;
  }

  private sumByStatus(
    bonuses: Array<{ status: SalesBonusStatus; commissionAmount: Prisma.Decimal }>,
    statuses: SalesBonusStatus[],
  ) {
    return Math.round(
      bonuses
        .filter((bonus) => statuses.includes(bonus.status))
        .reduce((sum, bonus) => sum + Number(bonus.commissionAmount), 0) * 100,
    ) / 100;
  }

  private requireBranchCeo(user: AuthUser) {
    if (!isBranchOwnerUser(user) || !user.branchId) {
      throw new ForbiddenException('Only Branch CEO can manage sales motivation');
    }
    return user.branchId;
  }

  private versionInclude() {
    return {
      createdBy: { select: { id: true, fullName: true } },
      planLevels: { orderBy: { sortOrder: 'asc' as const } },
      averageReceiptLevels: { orderBy: { sortOrder: 'asc' as const } },
    };
  }

  private toVersionResponse(version: any) {
    return {
      id: version.id,
      branchId: version.branchId,
      version: version.version,
      isActive: version.isActive,
      comment: version.comment,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      recommendationSource: version.recommendationSource,
      fullPaymentCommissionPercent: Number(version.fullPaymentCommissionPercent),
      fullPaymentMinCommission: Number(version.fullPaymentMinCommission),
      fullPaymentMaxCommission:
        version.fullPaymentMaxCommission != null ? Number(version.fullPaymentMaxCommission) : null,
      fullPaymentEffectiveFrom: version.fullPaymentEffectiveFrom,
      fullPaymentTrigger: version.fullPaymentTrigger as FullPaymentBonusTrigger,
      installmentApprovalCommissionPercent: Number(version.installmentApprovalCommissionPercent),
      installmentRepaymentCommissionPercent: Number(version.installmentRepaymentCommissionPercent),
      installmentEffectiveFrom: version.installmentEffectiveFrom,
      installmentTrigger: version.installmentTrigger as InstallmentBonusTrigger,
      returningCustomerDays: version.returningCustomerDays,
      returningCustomerBonusType: version.returningCustomerBonusType as SalesMotivationBonusType,
      returningCustomerFixedAmount:
        version.returningCustomerFixedAmount != null
          ? Number(version.returningCustomerFixedAmount)
          : null,
      returningCustomerPercent:
        version.returningCustomerPercent != null ? Number(version.returningCustomerPercent) : null,
      averageReceiptMinCount: version.averageReceiptMinCount,
      planLevels: (version.planLevels ?? []).map((level: any) => ({
        id: level.id,
        salesThreshold: Number(level.salesThreshold),
        bonusAmount: Number(level.bonusAmount),
        sortOrder: level.sortOrder,
      })),
      averageReceiptLevels: (version.averageReceiptLevels ?? []).map((level: any) => ({
        id: level.id,
        averageReceiptThreshold: Number(level.averageReceiptThreshold),
        bonusAmount: Number(level.bonusAmount),
        sortOrder: level.sortOrder,
      })),
    };
  }

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    branchId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          branchId,
          userId: user.id,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  }
}
