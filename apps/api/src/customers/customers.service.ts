import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerStatus,
  CustomerEvent,
  CustomerEventType,
  FollowUpStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyHqRole } from '../rbac/rbac';
import { AddCustomerEventDto } from './dto/add-customer-event.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { canArchiveCustomer } from '../rbac/rbac';
import { toRoleAwareCustomerListItem } from './customer-list.presenter';

type CustomerSaleHistory = {
  id: string;
  receiptNumber: string;
  saleDate: Date;
  totalAmount: Prisma.Decimal;
  profitAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  debtAmount: Prisma.Decimal;
  paymentStatus: string;
  items?: Array<{
    id: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    totalPrice: Prisma.Decimal;
    profitAmount: Prisma.Decimal;
  }>;
  payments?: Array<{
    id: string;
    amount: Prisma.Decimal;
    method: string;
    paidAt: Date;
    note: string | null;
  }>;
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: CustomerQueryDto) {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...this.buildBranchWhere(user, query.branchId),
    };

    if (query.status) {
      where.status = query.status;
    } else if (!query.includeArchived) {
      where.status = { not: CustomerStatus.ARCHIVED };
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { whatsappPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsappPhone: true,
        status: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        totalPurchaseAmount: true,
        totalProfitAmount: true,
        totalDebtAmount: true,
        createdAt: true,
        updatedAt: true,
        sales: {
          where: { deletedAt: null, status: SaleStatus.FINALIZED },
          select: {
            id: true,
            saleDate: true,
          },
          orderBy: { saleDate: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return customers.map((customer) =>
      toRoleAwareCustomerListItem(
        user,
        this.toCustomerListItem(customer, customer.sales),
      ),
    );
  }

  async create(user: AuthUser, dto: CreateCustomerDto) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    await this.ensureBranchExists(branchId);

    const customer = await this.prisma.customer.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone,
        branchId,
        status: dto.status,
        notes: dto.notes,
        totalPurchaseAmount: dto.totalPurchaseAmount,
        totalProfitAmount: dto.totalProfitAmount,
        totalDebtAmount: dto.totalDebtAmount,
      },
      include: { branch: true, events: true, sales: true },
    });

    await this.audit(user, branchId, 'CUSTOMER_CREATED', 'Customer', customer.id);
    return this.toCustomerProfile(customer, customer.events, customer.sales);
  }

  async findOne(user: AuthUser, id: string) {
    const customer = await this.getAccessibleCustomer(user, id);
    return this.toCustomerProfile(customer, customer.events, customer.sales);
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    await this.getAccessibleCustomer(user, id);

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone,
        status: dto.status,
        notes: dto.notes,
        totalPurchaseAmount: dto.totalPurchaseAmount,
        totalProfitAmount: dto.totalProfitAmount,
        totalDebtAmount: dto.totalDebtAmount,
      },
      include: { branch: true, events: true, sales: true },
    });

    await this.audit(user, customer.branchId, 'CUSTOMER_UPDATED', 'Customer', id);
    return this.toCustomerProfile(customer, customer.events, customer.sales);
  }

  async softDelete(user: AuthUser, id: string) {
    if (!canArchiveCustomer(user)) {
      throw new ForbiddenException('У вас нет прав удалять клиентов');
    }

    const existing = await this.getAccessibleCustomer(user, id);

    const archived = await this.prisma.customer.update({
      where: { id },
      data: { status: CustomerStatus.ARCHIVED },
      select: { id: true, status: true },
    });
    await this.audit(user, existing.branchId, 'CUSTOMER_ARCHIVED', 'Customer', id);
    return archived;
  }

  async listFollowUps(user: AuthUser) {
    const where: Prisma.FollowUpWhereInput = {
      ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
    };

    return this.prisma.followUp.findMany({
      where,
      include: {
        customer: {
          select: { id: true, fullName: true, phone: true },
        },
        createdBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
  }

  async addEvent(user: AuthUser, customerId: string, dto: AddCustomerEventDto) {
    const customer = await this.getAccessibleCustomer(user, customerId);

    return this.prisma.customerEvent.create({
      data: {
        customerId: customer.id,
        branchId: customer.branchId,
        type: dto.type,
        message: dto.message,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async addWhatsAppEvent(user: AuthUser, customerId: string, message: string) {
    return this.addEvent(user, customerId, {
      type: CustomerEventType.WHATSAPP,
      message,
    });
  }

  async addFollowUp(
    user: AuthUser,
    customerId: string,
    dto: CreateFollowUpDto,
  ) {
    const customer = await this.getAccessibleCustomer(user, customerId);

    return this.prisma.followUp.create({
      data: {
        customerId: customer.id,
        branchId: customer.branchId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    }).then(async (followUp) => {
      await this.audit(user, customer.branchId, 'FOLLOWUP_CREATED', 'FollowUp', followUp.id);
      return followUp;
    });
  }

  async markFollowUpDone(
    user: AuthUser,
    customerId: string,
    followUpId: string,
  ) {
    const customer = await this.getAccessibleCustomer(user, customerId);
    const followUp = await this.prisma.followUp.findFirst({
      where: {
        id: followUpId,
        customerId: customer.id,
        branchId: customer.branchId,
      },
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }

    return this.prisma.followUp.update({
      where: { id: followUpId },
      data: { status: FollowUpStatus.DONE },
    });
  }

  async timeline(user: AuthUser, customerId: string) {
    const customer = await this.getAccessibleCustomer(user, customerId);
    const [events, followUps] = await Promise.all([
      this.prisma.customerEvent.findMany({
        where: {
          customerId: customer.id,
          branchId: customer.branchId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.followUp.findMany({
        where: {
          customerId: customer.id,
          branchId: customer.branchId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const timeline = [
      ...customer.sales.map((sale) => ({
        kind: 'sale' as const,
        at: sale.saleDate,
        item: sale,
      })),
      ...customer.sales.flatMap((sale) =>
        sale.payments.map((payment) => ({
          kind: 'payment' as const,
          at: payment.paidAt,
          item: {
            ...payment,
            saleId: sale.id,
            receiptNumber: sale.receiptNumber,
          },
        })),
      ),
      ...events.map((event) => ({
        kind: 'event' as const,
        at: event.createdAt,
        item: event,
      })),
      ...followUps.map((followUp) => ({
        kind: 'followUp' as const,
        at: followUp.createdAt,
        item: followUp,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      customer: this.toCustomerProfile(customer, events, customer.sales),
      events,
      whatsappEvents: events.filter(
        (event) => event.type === CustomerEventType.WHATSAPP,
      ),
      followUps,
      purchaseHistory: this.toPurchaseHistory(customer.sales),
      serviceHistory: {
        diagnostics: [],
        repairs: [
          ...customer.serviceOrders.map((order) => ({
            id: order.id,
            date: order.completedAt ?? order.createdAt,
            description: `${order.orderNumber}: ${order.problemDescription}`,
            status: order.status,
            totalAmount: Number(order.totalAmount),
          })),
          ...events
            .filter((event) => event.type === CustomerEventType.SERVICE)
            .map((event) => ({
              id: event.id,
              date: event.createdAt,
              description: event.message,
              createdBy: event.createdBy,
            })),
        ],
        warrantyRecords: customer.warranties.map((warranty) => ({
          id: warranty.id,
          date: warranty.startsAt,
          description: warranty.warrantyNumber,
          status: warranty.status,
        })),
      },
      timeline,
    };
  }

  private buildBranchWhere(user: AuthUser, requestedBranchId?: string) {
    if (this.canAccessAllBranches(user)) {
      return requestedBranchId ? { branchId: requestedBranchId } : {};
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: user.branchId };
  }

  private resolveBranchId(user: AuthUser, requestedBranchId?: string) {
    if (this.canAccessAllBranches(user)) {
      return requestedBranchId ?? user.branchId;
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return user.branchId;
  }

  private async ensureBranchExists(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  private audit(user: AuthUser, branchId: string, action: string, entity: string, entityId: string) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          branchId,
          roles: user.roles ?? [user.role],
        },
      },
    });
  }

  private canAccessAllBranches(user: AuthUser) {
    return hasAnyHqRole(user.roles?.length ? user.roles : [user.role]);
  }

  private async getAccessibleCustomer(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        branch: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
        sales: {
          where: { deletedAt: null, status: SaleStatus.FINALIZED },
          include: {
            items: true,
            payments: {
              orderBy: { paidAt: 'desc' },
            },
            receipt: true,
          },
          orderBy: { saleDate: 'desc' },
        },
        serviceOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        warranties: {
          orderBy: { expiresAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private toCustomerListItem<
    T extends {
      id: string;
      fullName: string;
      phone: string;
      whatsappPhone: string | null;
      status: string;
      branchId: string;
      branch: { id: string; name: string; code: string };
      totalPurchaseAmount: Prisma.Decimal;
      totalProfitAmount: Prisma.Decimal;
      totalDebtAmount: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
    },
  >(customer: T, sales: { id: string; saleDate: Date }[]) {
    const purchaseCount = sales.length;
    const lastPurchaseDate = sales[0]?.saleDate ?? null;
    const totalPurchases = Number(customer.totalPurchaseAmount);
    const totalProfit = Number(customer.totalProfitAmount);
    const totalDebt = Number(customer.totalDebtAmount);

    return {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone,
      status: customer.status,
      branchId: customer.branchId,
      branch: customer.branch,
      totalPurchases,
      totalProfit,
      totalDebt,
      purchaseCount,
      lastPurchaseDate,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      totalPurchaseAmount: totalPurchases,
      totalProfitAmount: totalProfit,
      totalDebtAmount: totalDebt,
    };
  }

  private toCustomerProfile<
    T extends {
      id: string;
      fullName: string;
      phone: string;
      whatsappPhone: string | null;
      branchId: string;
      branch: { id: string; name: string; code: string };
      status: string;
      notes: string | null;
      totalPurchaseAmount: Prisma.Decimal;
      totalProfitAmount: Prisma.Decimal;
      totalDebtAmount: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    },
  >(customer: T, _events: CustomerEvent[], sales: CustomerSaleHistory[]) {
    const totalPurchases = Number(customer.totalPurchaseAmount);
    const totalProfit = Number(customer.totalProfitAmount);
    const totalDebt = Number(customer.totalDebtAmount);
    const purchaseCount = sales.length;
    const totalPayments = Math.max(totalPurchases - totalDebt, 0);
    const averageOrderValue =
      purchaseCount > 0 ? totalPurchases / purchaseCount : 0;

    return {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone,
      branchId: customer.branchId,
      branch: customer.branch,
      status: customer.status,
      notes: customer.notes,
      totalPurchases,
      totalProfit,
      totalDebt,
      totalPayments,
      averageOrderValue,
      purchaseCount,
      lastPurchaseDate: sales[0]?.saleDate ?? null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      deletedAt: customer.deletedAt,
      totalPurchaseAmount: totalPurchases,
      totalProfitAmount: totalProfit,
      totalDebtAmount: totalDebt,
    };
  }

  private toPurchaseHistory(sales: CustomerSaleHistory[]) {
    return sales.map((sale) => ({
      id: sale.id,
      date: sale.saleDate,
      invoiceNumber: sale.receiptNumber,
      products:
        sale.items?.map((item) => item.productName).join(', ') ||
        'Manual sale',
      quantity:
        sale.items?.reduce((sum, item) => sum + item.quantity, 0) ?? null,
      totalAmount: Number(sale.totalAmount),
      profit: Number(sale.profitAmount),
      paymentStatus: sale.paymentStatus,
    }));
  }
}
