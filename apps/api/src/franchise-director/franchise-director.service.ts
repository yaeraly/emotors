import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertStatus,
  AlertType,
  BranchStatus,
  BranchType,
  FranchiseExpansionStatus,
  FranchiseSupportTaskStatus,
  NotificationModule,
  Prisma,
  Role,
  SaleStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';

const FD_ROLES = new Set<Role>([Role.FRANCHISE_DIRECTOR, Role.OWNER, Role.CEO]);

@Injectable()
export class FranchiseDirectorService {
  constructor(private readonly prisma: PrismaService) {}

  assertFranchiseDirectorAccess(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (hasAnyFullAccessRole(roles) || roles.includes(Role.FRANCHISE_DIRECTOR)) return;
    throw new ForbiddenException('Franchise Director access required');
  }

  private monthStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private async franchiseBranches(filters?: {
    region?: string;
    branchId?: string;
    status?: string;
  }) {
    return this.prisma.branch.findMany({
      where: {
        deletedAt: null,
        branchType: { in: [BranchType.FRANCHISE, BranchType.DEALER, BranchType.DISTRIBUTOR] },
        ...(filters?.branchId ? { id: filters.branchId } : {}),
        ...(filters?.status ? { status: filters.status as BranchStatus } : {}),
        ...(filters?.region
          ? { OR: [{ city: { contains: filters.region, mode: 'insensitive' } }, { address: { contains: filters.region, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        users: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: { id: true, fullName: true, role: true, email: true },
        },
      },
    });
  }

  private async branchPerformance(branchId: string, from?: Date, to?: Date) {
    const saleDate =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : { gte: this.monthStart() };

    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : { gte: this.monthStart() };

    const [sales, serviceOrders, customers, inventory, warranties, employees, nps, targets] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: { branchId, deletedAt: null, status: SaleStatus.FINALIZED, saleDate },
          select: { totalAmount: true, profitAmount: true, customerId: true },
        }),
        this.prisma.serviceOrder.count({
          where: { branchId, deletedAt: null, createdAt },
        }),
        this.prisma.customer.count({ where: { branchId, deletedAt: null } }),
        this.prisma.inventoryBalance.findMany({
          where: { branchId },
          select: { quantity: true, totalValueKgs: true, product: { select: { minStockLevel: true } } },
        }),
        this.prisma.warranty.count({
          where: { branchId, createdAt },
        }),
        this.prisma.user.count({
          where: { branchId, deletedAt: null, status: 'ACTIVE' },
        }),
        this.prisma.npsSurvey.aggregate({
          where: { branchId },
          _avg: { score: true },
        }),
        this.prisma.branchKpiTarget.findMany({
          where: { branchId, month: { gte: this.monthStart() } },
        }),
      ]);

    const revenue = sales.reduce((sum, row) => sum + Number(row.totalAmount), 0);
    const profit = sales.reduce((sum, row) => sum + Number(row.profitAmount), 0);
    const inventoryValue = inventory.reduce((sum, row) => sum + Number(row.totalValueKgs), 0);
    const lowStock = inventory.filter((row) => row.quantity <= row.product.minStockLevel).length;
    const salesCount = sales.length;
    const targetSales = targets.find((row) => row.metric.toLowerCase().includes('sales'));
    const kpiScore =
      targetSales && Number(targetSales.targetValue) > 0
        ? Math.min(100, Math.round((revenue / Number(targetSales.targetValue)) * 100))
        : Math.min(100, Math.round(revenue > 0 ? 70 + Math.min(revenue / 10000, 30) : 0));

    return {
      sales: salesCount,
      serviceOrders,
      revenue,
      profit,
      customerCount: customers,
      customerSatisfaction: Number(nps._avg.score ?? 0),
      inventoryTurnover: inventoryValue > 0 ? Number((revenue / inventoryValue).toFixed(2)) : 0,
      warrantyCases: warranties,
      employeeCount: employees,
      kpiScore,
      lowStockCount: lowStock,
      inventoryValue,
    };
  }

  async dashboard(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    const branches = await this.franchiseBranches();
    const performances = await Promise.all(
      branches.map(async (branch) => ({
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          status: branch.status,
          openedAt: branch.openedAt,
          ownerName: branch.ownerName,
        },
        metrics: await this.branchPerformance(branch.id),
      })),
    );

    const ranked = [...performances].sort((a, b) => b.metrics.revenue - a.metrics.revenue);
    const monthlySales = performances.reduce((sum, row) => sum + row.metrics.sales, 0);
    const monthlyServiceOrders = performances.reduce((sum, row) => sum + row.metrics.serviceOrders, 0);
    const monthlyRevenue = performances.reduce((sum, row) => sum + row.metrics.revenue, 0);

    const notifications = await this.prisma.alert.findMany({
      where: {
        status: AlertStatus.UNREAD,
        OR: [
          { recipientRole: Role.FRANCHISE_DIRECTOR },
          { type: { in: [
            AlertType.FRANCHISE_APPLICATION_NEW,
            AlertType.FRANCHISE_KPI_BELOW_TARGET,
            AlertType.FRANCHISE_BRANCH_INACTIVE,
            AlertType.FRANCHISE_REPORT_MISSING,
            AlertType.FRANCHISE_TASK_OVERDUE,
            AlertType.FRANCHISE_CERTIFICATE_EXPIRED,
            AlertType.FRANCHISE_CRITICAL_SHORTAGE,
            AlertType.LOW_STOCK,
            AlertType.OUT_OF_STOCK,
          ] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const growthByMonth: Array<{ month: string; openings: number; active: number }> = [];
    for (let i = 5; i >= 0; i -= 1) {
      const cursor = new Date();
      cursor.setMonth(cursor.getMonth() - i, 1);
      cursor.setHours(0, 0, 0, 0);
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      const openings = branches.filter(
        (branch) => branch.openedAt && branch.openedAt >= cursor && branch.openedAt < next,
      ).length;
      const active = branches.filter(
        (branch) =>
          branch.status === BranchStatus.ACTIVE &&
          (!branch.openedAt || branch.openedAt < next),
      ).length;
      growthByMonth.push({
        month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        openings,
        active,
      });
    }

    return {
      summary: {
        totalFranchises: branches.length,
        activeFranchises: branches.filter((b) => b.status === BranchStatus.ACTIVE).length,
        openingSoon: branches.filter((b) => b.status === BranchStatus.PENDING).length,
        suspendedFranchises: branches.filter((b) => b.status === BranchStatus.SUSPENDED).length,
        monthlySales,
        monthlyServiceOrders,
        monthlyRevenue,
      },
      topBranches: ranked.slice(0, 10),
      lowestBranches: [...ranked].reverse().slice(0, 10),
      kpiCompletion: performances.map((row) => ({
        branchId: row.branch.id,
        branchName: row.branch.name,
        kpiScore: row.metrics.kpiScore,
      })),
      growthByMonth,
      notifications,
    };
  }

  async branches(user: AuthUser, query: Record<string, string | undefined>) {
    this.assertFranchiseDirectorAccess(user);
    const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const to = query.dateTo ? new Date(query.dateTo) : undefined;
    const branches = await this.franchiseBranches({
      region: query.region,
      branchId: query.branchId,
      status: query.status,
    });

    return Promise.all(
      branches.map(async (branch) => {
        const metrics = await this.branchPerformance(branch.id, from, to);
        const owner = branch.users.find((u) => u.role === Role.FRANCHISE_OWNER) ?? null;
        const manager = branch.users.find((u) => u.role === Role.MANAGER) ?? null;
        return {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          region: branch.city ?? branch.address ?? null,
          address: branch.address,
          phone: branch.phone,
          status: branch.status,
          openedAt: branch.openedAt,
          ownerName: branch.ownerName,
          owner,
          manager,
          employees: branch.users,
          performance: metrics,
        };
      }),
    );
  }

  async branchDetail(user: AuthUser, branchId: string) {
    this.assertFranchiseDirectorAccess(user);
    const rows = await this.branches(user, { branchId });
    const detail = rows[0];
    if (!detail) throw new NotFoundException('Branch not found');
    return detail;
  }

  async monitoring(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    const branches = await this.branches(user, {});
    const issues: Array<{
      id: string;
      type: string;
      severity: 'low' | 'medium' | 'high';
      branchId: string | null;
      branchName: string | null;
      title: string;
      href: string;
    }> = [];

    for (const branch of branches) {
      if (branch.performance.revenue < 1000) {
        issues.push({
          id: `low-sales-${branch.id}`,
          type: 'LOW_SALES',
          severity: 'high',
          branchId: branch.id,
          branchName: branch.name,
          title: `Low sales: ${branch.name}`,
          href: `/franchise-director/branches/${branch.id}`,
        });
      }
      if (branch.performance.kpiScore < 50) {
        issues.push({
          id: `low-kpi-${branch.id}`,
          type: 'LOW_KPI',
          severity: 'high',
          branchId: branch.id,
          branchName: branch.name,
          title: `Low KPI: ${branch.name} (${branch.performance.kpiScore}%)`,
          href: `/franchise-director/branches/${branch.id}`,
        });
      }
      if (branch.performance.sales === 0 && branch.performance.serviceOrders === 0) {
        issues.push({
          id: `no-activity-${branch.id}`,
          type: 'NO_ACTIVITY',
          severity: 'medium',
          branchId: branch.id,
          branchName: branch.name,
          title: `No activity: ${branch.name}`,
          href: `/franchise-director/branches/${branch.id}`,
        });
      }
      if (branch.performance.warrantyCases >= 5) {
        issues.push({
          id: `high-warranty-${branch.id}`,
          type: 'HIGH_WARRANTY',
          severity: 'medium',
          branchId: branch.id,
          branchName: branch.name,
          title: `High warranty claims: ${branch.name}`,
          href: `/franchise-director/branches/${branch.id}`,
        });
      }
      if (branch.performance.lowStockCount > 0) {
        issues.push({
          id: `shortage-${branch.id}`,
          type: 'INVENTORY_SHORTAGE',
          severity: branch.performance.lowStockCount > 5 ? 'high' : 'medium',
          branchId: branch.id,
          branchName: branch.name,
          title: `Inventory shortages: ${branch.name} (${branch.performance.lowStockCount})`,
          href: `/franchise-director/supply?branchId=${branch.id}`,
        });
      }
    }

    const month = this.monthStart();
    const kpiTargets = await this.prisma.branchKpiTarget.findMany({
      where: { month: { gte: month } },
      select: { branchId: true },
    });
    const branchesWithKpi = new Set(kpiTargets.map((row) => row.branchId));
    for (const branch of branches) {
      if (!branchesWithKpi.has(branch.id) && branch.status === BranchStatus.ACTIVE) {
        issues.push({
          id: `report-${branch.id}`,
          type: 'OVERDUE_REPORT',
          severity: 'medium',
          branchId: branch.id,
          branchName: branch.name,
          title: `Overdue / missing KPI report: ${branch.name}`,
          href: `/franchise-director/branches/${branch.id}`,
        });
      }
    }

    const overdueTasks = await this.prisma.franchiseSupportTask.findMany({
      where: {
        status: { in: [FranchiseSupportTaskStatus.OPEN, FranchiseSupportTaskStatus.IN_PROGRESS, FranchiseSupportTaskStatus.OVERDUE] },
        dueAt: { lt: new Date() },
      },
      include: { branch: { select: { id: true, name: true } } },
      take: 50,
    });
    for (const task of overdueTasks) {
      issues.push({
        id: `task-${task.id}`,
        type: 'OVERDUE_TASK',
        severity: 'high',
        branchId: task.branchId,
        branchName: task.branch?.name ?? null,
        title: `Overdue task: ${task.title}`,
        href: `/franchise-director/support`,
      });
    }

    const expiredCertificates = await this.prisma.certificate.findMany({
      where: { expiresAt: { lt: new Date() } },
      include: { student: { select: { id: true, fullName: true } } },
      take: 50,
    });
    for (const cert of expiredCertificates) {
      issues.push({
        id: `cert-${cert.id}`,
        type: 'MISSING_ACADEMY_CERT',
        severity: 'medium',
        branchId: null,
        branchName: null,
        title: `Expired certificate: ${cert.student?.fullName ?? cert.id}`,
        href: `/franchise-director/academy`,
      });
    }

    return { issues, counts: {
      lowSales: issues.filter((i) => i.type === 'LOW_SALES').length,
      lowKpi: issues.filter((i) => i.type === 'LOW_KPI').length,
      noActivity: issues.filter((i) => i.type === 'NO_ACTIVITY').length,
      highWarranty: issues.filter((i) => i.type === 'HIGH_WARRANTY').length,
      overdueReports: issues.filter((i) => i.type === 'OVERDUE_REPORT').length,
      overdueTasks: issues.filter((i) => i.type === 'OVERDUE_TASK').length,
      expiredCertificates: issues.filter((i) => i.type === 'MISSING_ACADEMY_CERT').length,
      inventoryShortages: issues.filter((i) => i.type === 'INVENTORY_SHORTAGE').length,
    } };
  }

  async listExpansion(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    return this.prisma.franchiseExpansionLead.findMany({
      include: {
        responsibleManager: { select: { id: true, fullName: true, role: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createExpansion(user: AuthUser, dto: Record<string, unknown>) {
    this.assertFranchiseDirectorAccess(user);
    if (!dto.fullName || !dto.phone) throw new BadRequestException('fullName and phone are required');
    const created = await this.prisma.franchiseExpansionLead.create({
      data: {
        fullName: String(dto.fullName),
        phone: String(dto.phone),
        city: dto.city ? String(dto.city) : null,
        region: dto.region ? String(dto.region) : null,
        status: (dto.status as FranchiseExpansionStatus) || FranchiseExpansionStatus.LEAD,
        agreementStatus: dto.agreementStatus ? String(dto.agreementStatus) : null,
        documentsNote: dto.documentsNote ? String(dto.documentsNote) : null,
        plannedOpeningDate: dto.plannedOpeningDate ? new Date(String(dto.plannedOpeningDate)) : null,
        responsibleManagerId: dto.responsibleManagerId ? String(dto.responsibleManagerId) : null,
        notes: dto.notes ? String(dto.notes) : null,
        createdById: user.id,
      },
    });
    await this.audit(user, 'FRANCHISE_EXPANSION_CREATED', 'FranchiseExpansionLead', created.id, {
      status: created.status,
    });
    await this.prisma.alert.create({
      data: {
        type: AlertType.FRANCHISE_APPLICATION_NEW,
        module: NotificationModule.FRANCHISE,
        title: 'New franchise application',
        message: `${created.fullName} — ${created.city ?? created.region ?? 'n/a'}`,
        recipientRole: Role.FRANCHISE_DIRECTOR,
        status: AlertStatus.UNREAD,
      },
    });
    return created;
  }

  async updateExpansion(user: AuthUser, id: string, dto: Record<string, unknown>) {
    this.assertFranchiseDirectorAccess(user);
    const existing = await this.prisma.franchiseExpansionLead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expansion lead not found');
    const updated = await this.prisma.franchiseExpansionLead.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: String(dto.fullName) } : {}),
        ...(dto.phone !== undefined ? { phone: String(dto.phone) } : {}),
        ...(dto.city !== undefined ? { city: dto.city ? String(dto.city) : null } : {}),
        ...(dto.region !== undefined ? { region: dto.region ? String(dto.region) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as FranchiseExpansionStatus } : {}),
        ...(dto.agreementStatus !== undefined
          ? { agreementStatus: dto.agreementStatus ? String(dto.agreementStatus) : null }
          : {}),
        ...(dto.documentsNote !== undefined
          ? { documentsNote: dto.documentsNote ? String(dto.documentsNote) : null }
          : {}),
        ...(dto.plannedOpeningDate !== undefined
          ? { plannedOpeningDate: dto.plannedOpeningDate ? new Date(String(dto.plannedOpeningDate)) : null }
          : {}),
        ...(dto.responsibleManagerId !== undefined
          ? { responsibleManagerId: dto.responsibleManagerId ? String(dto.responsibleManagerId) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ? String(dto.notes) : null } : {}),
      },
    });
    if (dto.status && String(dto.status) !== existing.status) {
      await this.audit(user, 'FRANCHISE_STATUS_CHANGED', 'FranchiseExpansionLead', id, {
        from: existing.status,
        to: updated.status,
      });
    }
    return updated;
  }

  async listTasks(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    const now = new Date();
    const tasks = await this.prisma.franchiseSupportTask.findMany({
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assigneeUser: { select: { id: true, fullName: true, role: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map((task) => {
      const overdue =
        task.dueAt &&
        task.dueAt < now &&
        task.status !== FranchiseSupportTaskStatus.COMPLETED &&
        task.status !== FranchiseSupportTaskStatus.CANCELLED;
      return {
        ...task,
        status: overdue ? FranchiseSupportTaskStatus.OVERDUE : task.status,
        isOverdue: Boolean(overdue),
      };
    });
  }

  async createTask(user: AuthUser, dto: Record<string, unknown>) {
    this.assertFranchiseDirectorAccess(user);
    if (!dto.title) throw new BadRequestException('title is required');
    const created = await this.prisma.franchiseSupportTask.create({
      data: {
        title: String(dto.title),
        description: dto.description ? String(dto.description) : null,
        assigneeRole: dto.assigneeRole ? String(dto.assigneeRole) : null,
        assigneeUserId: dto.assigneeUserId ? String(dto.assigneeUserId) : null,
        branchId: dto.branchId ? String(dto.branchId) : null,
        dueAt: dto.dueAt ? new Date(String(dto.dueAt)) : null,
        createdById: user.id,
      },
    });
    await this.audit(user, 'FRANCHISE_TASK_CREATED', 'FranchiseSupportTask', created.id, {
      title: created.title,
      assigneeRole: created.assigneeRole,
    });
    if (created.assigneeUserId || created.assigneeRole) {
      await this.audit(user, 'FRANCHISE_TASK_ASSIGNED', 'FranchiseSupportTask', created.id, {
        assigneeUserId: created.assigneeUserId,
        assigneeRole: created.assigneeRole,
      });
    }
    return created;
  }

  async updateTask(user: AuthUser, id: string, dto: Record<string, unknown>) {
    this.assertFranchiseDirectorAccess(user);
    const existing = await this.prisma.franchiseSupportTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    const nextStatus = dto.status ? (dto.status as FranchiseSupportTaskStatus) : existing.status;
    const updated = await this.prisma.franchiseSupportTask.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: String(dto.title) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ? String(dto.description) : null }
          : {}),
        ...(dto.assigneeRole !== undefined
          ? { assigneeRole: dto.assigneeRole ? String(dto.assigneeRole) : null }
          : {}),
        ...(dto.assigneeUserId !== undefined
          ? { assigneeUserId: dto.assigneeUserId ? String(dto.assigneeUserId) : null }
          : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId ? String(dto.branchId) : null } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(String(dto.dueAt)) : null } : {}),
        ...(dto.status !== undefined ? { status: nextStatus } : {}),
        ...(nextStatus === FranchiseSupportTaskStatus.COMPLETED
          ? { completedAt: new Date() }
          : {}),
      },
    });
    if (dto.assigneeUserId || dto.assigneeRole) {
      await this.audit(user, 'FRANCHISE_TASK_ASSIGNED', 'FranchiseSupportTask', id, {
        assigneeUserId: updated.assigneeUserId,
        assigneeRole: updated.assigneeRole,
      });
    }
    if (nextStatus === FranchiseSupportTaskStatus.COMPLETED && existing.status !== FranchiseSupportTaskStatus.COMPLETED) {
      await this.audit(user, 'FRANCHISE_TASK_COMPLETED', 'FranchiseSupportTask', id, {
        title: updated.title,
      });
    }
    return updated;
  }

  async academy(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    const [students, certificates, enrollments, courses] = await Promise.all([
      this.prisma.student.findMany({
        include: {
          enrollments: { include: { course: true } },
          certificates: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.certificate.findMany({
        include: { student: true, course: true },
        orderBy: { issuedAt: 'desc' },
        take: 200,
      }),
      this.prisma.enrollment.findMany({
        include: { student: true, course: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.course.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const now = new Date();
    return {
      courses,
      students,
      enrollments,
      certificates,
      expiredCertificates: certificates.filter((c) => c.expiresAt && c.expiresAt < now),
      requiredTraining: enrollments.filter((e) => e.status === 'ACTIVE'),
    };
  }

  async marketing(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    const [campaigns, promotions, assets] = await Promise.all([
      this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.marketingAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return {
      campaigns,
      promotions,
      assets,
      activeCampaigns: campaigns.filter((c) => c.isActive),
    };
  }

  async supply(user: AuthUser, query: Record<string, string | undefined>) {
    this.assertFranchiseDirectorAccess(user);
    const branchId = query.branchId;
    const branches = await this.franchiseBranches(branchId ? { branchId } : undefined);
    const stock = await Promise.all(
      branches.map(async (branch) => {
        const balances = await this.prisma.inventoryBalance.findMany({
          where: { branchId: branch.id },
          include: { product: { select: { id: true, name: true, sku: true, minStockLevel: true } } },
        });
        const critical = balances.filter((row) => row.quantity <= row.product.minStockLevel);
        return {
          branch: { id: branch.id, name: branch.name, code: branch.code },
          stockLevel: balances.reduce((sum, row) => sum + row.quantity, 0),
          inventoryValue: balances.reduce((sum, row) => sum + Number(row.totalValueKgs), 0),
          criticalShortages: critical.map((row) => ({
            productId: row.product.id,
            sku: row.product.sku,
            name: row.product.name,
            quantity: row.quantity,
            minStockLevel: row.product.minStockLevel,
          })),
        };
      }),
    );

    const pendingOrders = await this.prisma.branchPurchaseRequest.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: {
          in: [
            'SUBMITTED',
            'SUBMITTED_TO_HQ',
            'REVIEWED_BY_HQ_SALES',
            'APPROVED',
            'PARTIALLY_APPROVED',
            'PENDING_BRANCH_CONFIRMATION',
            'PENDING_PAYMENT',
            'READY_FOR_HQ_WAREHOUSE',
          ] as any,
        },
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const delayedShipments = await this.prisma.branchDistributionOrder.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: {
          in: [
            'APPROVED',
            'SENT_TO_WAREHOUSE',
            'PICKING',
            'PACKED',
            'SHIPPED',
            'SENT',
          ] as any,
        },
        createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return { stock, pendingOrders, delayedShipments };
  }

  async finance(user: AuthUser, query: Record<string, string | undefined>) {
    this.assertFranchiseDirectorAccess(user);
    const from = query.dateFrom ? new Date(query.dateFrom) : this.monthStart();
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    const branches = await this.franchiseBranches(query.branchId ? { branchId: query.branchId } : undefined);

    const rows = await Promise.all(
      branches.map(async (branch) => {
        const [sales, expenses, invoices, overduePayments] = await Promise.all([
          this.prisma.sale.findMany({
            where: {
              branchId: branch.id,
              deletedAt: null,
              status: SaleStatus.FINALIZED,
              saleDate: { gte: from, lte: to },
            },
            select: { totalAmount: true, profitAmount: true, debtAmount: true },
          }),
          this.prisma.financeExpense.aggregate({
            where: { branchId: branch.id, expenseDate: { gte: from, lte: to } },
            _sum: { amount: true },
          }),
          this.prisma.branchInvoice.findMany({
            where: { branchId: branch.id, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as any } },
            select: { id: true, invoiceNumber: true, totalAmount: true, status: true, dueDate: true },
            take: 50,
          }),
          this.prisma.branchPayment.count({
            where: {
              branchId: branch.id,
              confirmationStatus: 'PENDING_CONFIRMATION',
              createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);
        const revenue = sales.reduce((sum, row) => sum + Number(row.totalAmount), 0);
        const profit = sales.reduce((sum, row) => sum + Number(row.profitAmount), 0);
        const outstanding = sales.reduce((sum, row) => sum + Number(row.debtAmount), 0);
        return {
          branch: { id: branch.id, name: branch.name, code: branch.code },
          revenue,
          expenses: Number(expenses._sum.amount ?? 0),
          profit,
          outstandingInvoices: invoices,
          overduePayments,
        };
      }),
    );

    return {
      from,
      to,
      branches: rows,
      totals: {
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
        expenses: rows.reduce((sum, row) => sum + row.expenses, 0),
        profit: rows.reduce((sum, row) => sum + row.profit, 0),
        overduePayments: rows.reduce((sum, row) => sum + row.overduePayments, 0),
      },
    };
  }

  async reports(user: AuthUser, query: Record<string, string | undefined>) {
    this.assertFranchiseDirectorAccess(user);
    const data = await this.branches(user, query);
    const filtered = query.ownerName
      ? data.filter((row) =>
          (row.ownerName ?? row.owner?.fullName ?? '')
            .toLowerCase()
            .includes(String(query.ownerName).toLowerCase()),
        )
      : data;

    await this.audit(user, 'FRANCHISE_REPORT_EXPORTED', 'FranchiseDirectorReport', user.id, {
      filters: query,
      rowCount: filtered.length,
    });

    return {
      generatedAt: new Date().toISOString(),
      filters: query,
      rows: filtered.map((row) => ({
        branchId: row.id,
        branchName: row.name,
        region: row.region,
        owner: row.ownerName ?? row.owner?.fullName ?? null,
        status: row.status,
        sales: row.performance.sales,
        serviceOrders: row.performance.serviceOrders,
        revenue: row.performance.revenue,
        profit: row.performance.profit,
        kpiScore: row.performance.kpiScore,
        customers: row.performance.customerCount,
        customerSatisfaction: row.performance.customerSatisfaction,
        employees: row.performance.employeeCount,
      })),
    };
  }

  async notifications(user: AuthUser) {
    this.assertFranchiseDirectorAccess(user);
    return this.prisma.alert.findMany({
      where: {
        OR: [
          { recipientRole: Role.FRANCHISE_DIRECTOR },
          { module: NotificationModule.FRANCHISE },
          {
            type: {
              in: [
                AlertType.FRANCHISE_APPLICATION_NEW,
                AlertType.FRANCHISE_KPI_BELOW_TARGET,
                AlertType.FRANCHISE_BRANCH_INACTIVE,
                AlertType.FRANCHISE_REPORT_MISSING,
                AlertType.FRANCHISE_TASK_OVERDUE,
                AlertType.FRANCHISE_CERTIFICATE_EXPIRED,
                AlertType.FRANCHISE_CRITICAL_SHORTAGE,
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async audit(
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
