import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { DistributionService } from '../distribution/distribution.service';
import { AddBranchPaymentDto } from '../distribution/dto/add-branch-payment.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  canSendInvoiceToCashier,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  buildWorkflowStatusWhere,
  sanitizeAccountantInvoice,
  sanitizeBranchCashierInvoice,
} from './branch-accountant-invoice.presenter';
import { BranchAccountantInvoiceQueryDto } from './dto/branch-accountant-invoice-query.dto';
import { BranchAccountantInstallmentRequestDto } from './dto/installment-request.dto';
import { SelectPaymentTypeDto } from './dto/select-payment-type.dto';

@Injectable()
export class BranchAccountantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distributionService: DistributionService,
  ) {}

  private assertBranchAccountant(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (!user.branchId || hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Доступ только для бухгалтера филиала');
    }
    if (!roles.includes(Role.ACCOUNTANT)) {
      throw new ForbiddenException('Доступ только для бухгалтера филиала');
    }
  }

  private assertBranchCashier(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (!user.branchId || hasAnyFullAccessRole(roles)) {
      throw new ForbiddenException('Доступ только для кассира филиала');
    }
    if (!roles.includes(Role.CASHIER)) {
      throw new ForbiddenException('Доступ только для кассира филиала');
    }
  }

  private invoiceInclude() {
    return {
      branch: { select: { id: true, name: true, code: true } },
      distributionOrder: {
        include: {
          items: {
            include: { product: { select: { unit: true } } },
          },
        },
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'desc' as const },
      },
      branchOrderInstallment: true,
    };
  }

  private async attachLinkedRequest<T extends { distributionOrderId: string }>(invoice: T) {
    const linkedRequest = await this.prisma.branchPurchaseRequest.findFirst({
      where: { convertedOrderId: invoice.distributionOrderId, deletedAt: null },
      select: { id: true, requestNumber: true },
    });
    return {
      ...invoice,
      distributionOrder: {
        ...(invoice as any).distributionOrder,
        branchPurchaseRequest: linkedRequest,
      },
    };
  }

  private async getAccountantInvoiceForBranch(user: AuthUser, id: string) {
    this.assertBranchAccountant(user);
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: { id, deletedAt: null, branchId: user.branchId! },
      include: this.invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    return this.attachLinkedRequest(invoice);
  }

  async listPendingConfirmedOrders(user: AuthUser) {
    this.assertBranchAccountant(user);
    const requests = await this.prisma.branchPurchaseRequest.findMany({
      where: {
        branchId: user.branchId!,
        deletedAt: null,
        status: 'BRANCH_CONFIRMED',
        convertedOrderId: { not: null },
      },
      include: { items: true },
      orderBy: { branchConfirmedAt: 'desc' },
    });

    const orderIds = requests.map((r) => r.convertedOrderId!).filter(Boolean);
    const orders = orderIds.length
      ? await this.prisma.branchDistributionOrder.findMany({
          where: { id: { in: orderIds }, deletedAt: null },
          include: {
            branchInvoices: {
              where: { deletedAt: null, invoiceCategory: 'PRODUCT_ORDER' },
              select: { id: true, invoiceNumber: true, sentToBranchAt: true },
            },
          },
        })
      : [];
    const orderById = new Map(orders.map((order) => [order.id, order]));

    return requests
      .filter((request) => {
        const order = request.convertedOrderId ? orderById.get(request.convertedOrderId) : null;
        if (!order || order.status !== 'DRAFT') return false;
        const invoice = order.branchInvoices?.[0];
        return !invoice?.sentToBranchAt;
      })
      .map((request) => {
        const order = request.convertedOrderId ? orderById.get(request.convertedOrderId) : null;
        return {
          id: request.id,
          requestNumber: request.requestNumber,
          branchConfirmedAt: request.branchConfirmedAt,
          totalEstimatedAmount: Number(request.totalEstimatedAmount ?? 0),
          itemCount: request.items.length,
          distributionOrderId: request.convertedOrderId,
          orderNumber: order?.orderNumber ?? null,
        };
      });
  }

  async createInvoiceFromConfirmedOrder(user: AuthUser, requestId: string) {
    this.assertBranchAccountant(user);

    const request = await this.prisma.branchPurchaseRequest.findFirst({
      where: {
        id: requestId,
        deletedAt: null,
        branchId: user.branchId!,
        status: 'BRANCH_CONFIRMED',
      },
    });
    if (!request?.convertedOrderId) {
      throw new NotFoundException('Согласованный заказ не найден');
    }

    const order = await this.prisma.branchDistributionOrder.findFirst({
      where: { id: request.convertedOrderId, deletedAt: null, branchId: user.branchId! },
      include: { branchInvoices: { where: { deletedAt: null } } },
    });
    if (!order) throw new NotFoundException('Заказ распределения не найден');
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Счёт по этому заказу уже создан');
    }

    const existingProductInvoice = order.branchInvoices?.find(
      (row) => !row.invoiceCategory || row.invoiceCategory === 'PRODUCT_ORDER',
    );
    if (existingProductInvoice?.sentToBranchAt) {
      throw new BadRequestException('Счёт уже доступен бухгалтеру');
    }

    await this.distributionService.approve(user, order.id, {
      skipStockReservation: true,
      skipPermissionCheck: true,
    });
    await this.distributionService.sendInvoice(user, order.id, { skipPermissionCheck: true });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_INVOICE_CREATED_BY_ACCOUNTANT',
        entity: 'BranchPurchaseRequest',
        entityId: request.id,
        metadata: {
          branchId: request.branchId,
          distributionOrderId: order.id,
          roles: user.roles ?? [user.role],
        },
      },
    });

    const invoice = await this.prisma.branchInvoice.findFirst({
      where: {
        distributionOrderId: order.id,
        deletedAt: null,
        invoiceCategory: 'PRODUCT_ORDER',
      },
    });
    if (!invoice) throw new NotFoundException('Счёт не создан');

    const enriched = await this.attachLinkedRequest(
      await this.prisma.branchInvoice.findFirstOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude(),
      }),
    );
    return sanitizeAccountantInvoice(enriched);
  }

  async listInvoices(user: AuthUser, query: BranchAccountantInvoiceQueryDto) {
    this.assertBranchAccountant(user);
    const where: Prisma.BranchInvoiceWhereInput = {
      deletedAt: null,
      branchId: user.branchId!,
      sentToBranchAt: { not: null },
    };

    if (query.search?.trim()) {
      where.invoiceNumber = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.orderNumber?.trim()) {
      where.distributionOrder = {
        orderNumber: { contains: query.orderNumber.trim(), mode: 'insensitive' },
      };
    }
    if (query.dateFrom || query.dateTo) {
      where.issuedAt = {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      };
    }
    if (query.workflowStatus) {
      const workflowWhere = buildWorkflowStatusWhere(query.workflowStatus);
      if (workflowWhere) Object.assign(where, workflowWhere);
    }

    const invoices = await this.prisma.branchInvoice.findMany({
      where,
      include: this.invoiceInclude(),
      orderBy: { issuedAt: 'desc' },
    });

    const enriched = await Promise.all(invoices.map((invoice) => this.attachLinkedRequest(invoice)));
    return enriched.map((invoice) => sanitizeAccountantInvoice(invoice));
  }

  async getInvoice(user: AuthUser, id: string) {
    const invoice = await this.getAccountantInvoiceForBranch(user, id);
    return sanitizeAccountantInvoice(invoice);
  }

  async selectPaymentType(user: AuthUser, id: string, dto: SelectPaymentTypeDto) {
    this.assertBranchAccountant(user);
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id, deletedAt: null, branchId: user.branchId! },
        include: { branchOrderInstallment: true },
      });
      if (!invoice) throw new NotFoundException('Счёт не найден');
      if (!invoice.sentToBranchAt) {
        throw new BadRequestException('Счёт ещё не доступен бухгалтеру');
      }
      if (invoice.sentToCashierAt) {
        throw new BadRequestException('Счёт уже передан кассиру');
      }
      if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Счёт уже закрыт');
      }
      if (invoice.branchOrderInstallment) {
        throw new BadRequestException('По счёту уже оформлена рассрочка');
      }
      if (dto.paymentType === BranchInvoicePaymentType.INSTALLMENT) {
        throw new BadRequestException('Для рассрочки используйте запрос рассрочки');
      }

      const updated = await tx.branchInvoice.update({
        where: { id },
        data: { paymentType: dto.paymentType },
        include: this.invoiceInclude(),
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PAYMENT_TYPE_SELECTED',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            branchId: invoice.branchId,
            oldPaymentType: invoice.paymentType,
            newPaymentType: dto.paymentType,
            roles: user.roles ?? [user.role],
          },
        },
      });

      const enriched = await this.attachLinkedRequest(updated);
      return sanitizeAccountantInvoice(enriched);
    });
  }

  async requestInstallment(user: AuthUser, id: string, dto: BranchAccountantInstallmentRequestDto) {
    await this.distributionService.requestInvoiceInstallment(user, id, {
      firstPaymentAmount: dto.firstPaymentAmount,
      termMonths: dto.termMonths ?? 3,
      firstPaymentRequired: true,
      dueDate: dto.dueDate,
      comment: dto.comment,
    });
    return this.getInvoice(user, id);
  }

  async sendToCashier(user: AuthUser, id: string) {
    if (!canSendInvoiceToCashier(user)) {
      throw new ForbiddenException('Только бухгалтер филиала может передать счёт кассиру');
    }

    const invoice = await this.prisma.branchInvoice.findFirst({
      where: { id, deletedAt: null, branchId: user.branchId! },
      include: { branchOrderInstallment: true },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    if (!invoice.paymentType) {
      throw new BadRequestException('Сначала выберите тип оплаты');
    }
    if (invoice.branchOrderInstallment?.status === BranchOrderInstallmentStatus.PENDING) {
      throw new BadRequestException('Рассрочка ожидает утверждения CEO');
    }

    const result = await this.distributionService.sendInvoiceToCashier(user, id);
    void result;
    return this.getInvoice(user, id);
  }

  async listCashierInvoices(user: AuthUser, query: BranchAccountantInvoiceQueryDto) {
    this.assertBranchCashier(user);
    const where: Prisma.BranchInvoiceWhereInput = {
      deletedAt: null,
      branchId: user.branchId!,
      sentToCashierAt: { not: null },
      status: { in: [BranchInvoiceStatus.ISSUED, BranchInvoiceStatus.PARTIALLY_PAID, BranchInvoiceStatus.OVERDUE] },
    };
    if (query.search?.trim()) {
      where.invoiceNumber = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.orderNumber?.trim()) {
      where.distributionOrder = {
        orderNumber: { contains: query.orderNumber.trim(), mode: 'insensitive' },
      };
    }

    const invoices = await this.prisma.branchInvoice.findMany({
      where,
      include: this.invoiceInclude(),
      orderBy: { sentToCashierAt: 'desc' },
    });
    const enriched = await Promise.all(invoices.map((invoice) => this.attachLinkedRequest(invoice)));
    return enriched.map((invoice) => sanitizeBranchCashierInvoice(invoice));
  }

  async getCashierInvoice(user: AuthUser, id: string) {
    this.assertBranchCashier(user);
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: {
        id,
        deletedAt: null,
        branchId: user.branchId!,
        sentToCashierAt: { not: null },
      },
      include: this.invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    const enriched = await this.attachLinkedRequest(invoice);
    return sanitizeBranchCashierInvoice(enriched);
  }

  async submitCashierPayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    this.assertBranchCashier(user);
    await this.distributionService.submitInvoicePayment(user, id, dto);
    return this.getCashierInvoice(user, id);
  }
}
