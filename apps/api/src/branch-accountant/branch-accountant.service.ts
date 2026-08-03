import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchInstallmentEarlyPaymentStatus,
  BranchOrderInstallmentStatus,
  Prisma,
  Role,
  SaleInstallmentApprovalStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { BranchInstallmentEarlyPaymentService } from '../distribution/branch-installment-early-payment.service';
import { CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES } from '../distribution/branch-installment-early-payment.util';
import { isBranchCashierInvoiceVisible } from '../distribution/branch-cashier-invoice-visibility.util';
import { isRetailInstallmentInCashierScope, isRetailInstallmentInvoice } from '../sales/sale-installment-invoice.util';
import {
  assertRetailSaleFinanceAllowed,
  buildActiveAccountantInvoiceWhere,
  isRetailSaleWorkflowStopped,
} from '../sales/branch-sale-rejection.util';
import { DistributionService } from '../distribution/distribution.service';
import { CreateInstallmentEarlyPaymentDto } from '../distribution/dto/create-installment-early-payment.dto';
import { AddBranchPaymentDto } from '../distribution/dto/add-branch-payment.dto';
import { PrismaService } from '../prisma/prisma.service';
import { BranchSaleInvoiceService } from '../sales/branch-sale-invoice.service';
import { SalesService } from '../sales/sales.service';
import { BranchCashierPaymentService } from '../finance/branch-cashier-payment.service';
import {
  canSendInvoiceToCashier,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  buildWorkflowStatusWhere,
  sanitizeAccountantInvoice,
  sanitizeBranchCashierInvoice,
  sanitizeRetailInstallmentCashierInvoice,
} from './branch-accountant-invoice.presenter';
import { BranchAccountantInvoiceQueryDto } from './dto/branch-accountant-invoice-query.dto';
import { BranchAccountantInstallmentRequestDto } from './dto/installment-request.dto';
import { SelectPaymentTypeDto } from './dto/select-payment-type.dto';

@Injectable()
export class BranchAccountantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distributionService: DistributionService,
    private readonly earlyPaymentService: BranchInstallmentEarlyPaymentService,
    private readonly salesService: SalesService,
    private readonly branchSaleInvoiceService: BranchSaleInvoiceService,
    private readonly branchCashierPaymentService: BranchCashierPaymentService,
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
      sale: {
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          items: true,
          installmentApproval: {
            include: {
              payments: {
                orderBy: { createdAt: 'desc' as const },
                take: 20,
              },
            },
          },
        },
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'desc' as const },
      },
      branchOrderInstallment: true,
      installmentEarlyPaymentRequests: {
        orderBy: { requestedAt: 'desc' as const },
        take: 5,
        include: {
          financeAccount: {
            select: { id: true, name: true, accountNumber: true, availableBalance: true, currentBalance: true },
          },
          requestedBy: { select: { id: true, fullName: true } },
          branchCeoApprovedBy: { select: { id: true, fullName: true } },
          sentToCashierBy: { select: { id: true, fullName: true } },
        },
      },
    };
  }

  private async attachLinkedRequest<T extends { distributionOrderId: string | null }>(invoice: T) {
    if (!invoice.distributionOrderId) {
      return invoice;
    }
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
    assertRetailSaleFinanceAllowed({
      invoiceStatus: invoice.status,
      installmentApproval: invoice.sale?.installmentApproval,
    });
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
      ...buildActiveAccountantInvoiceWhere(user.branchId!),
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
    const firstPaymentAmount = Number(dto.firstPaymentAmount);
    await this.distributionService.requestInvoiceInstallment(user, id, {
      firstPaymentAmount,
      termMonths: dto.termMonths ?? 3,
      firstPaymentRequired: firstPaymentAmount > 0.009,
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
      include: { branchOrderInstallment: true, sale: { include: { installmentApproval: true } } },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');

    if (isRetailInstallmentInvoice(invoice)) {
      if (!invoice.sentToBranchAt) {
        throw new BadRequestException('Счёт ещё не доступен бухгалтеру');
      }
      if (invoice.sentToCashierAt) {
        throw new BadRequestException('Счёт уже передан кассиру');
      }
      if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Счёт уже закрыт');
      }
      const approval = invoice.sale?.installmentApproval;
      assertRetailSaleFinanceAllowed({
        invoiceStatus: invoice.status,
        installmentApproval: approval,
      });
      if (!approval || approval.status === SaleInstallmentApprovalStatus.REJECTED || approval.status === SaleInstallmentApprovalStatus.CANCELLED) {
        throw new BadRequestException('Рассрочка недоступна для передачи кассиру');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.branchSaleInvoiceService.sendRetailInstallmentToCashierInTx(tx, user, {
          branchId: invoice.branchId,
          saleId: invoice.saleId!,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      });
      return this.getInvoice(user, id);
    }

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
      AND: [
        {
          NOT: {
            sale: {
              installmentApproval: {
                status: {
                  in: [SaleInstallmentApprovalStatus.REJECTED, SaleInstallmentApprovalStatus.CANCELLED],
                },
              },
            },
          },
        },
        {
          NOT: {
            installmentEarlyPaymentRequests: {
              some: { status: BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO },
            },
          },
        },
      ],
      OR: [
        { paymentType: BranchInvoicePaymentType.FULL_PAYMENT },
        {
          branchOrderInstallment: {
            status: BranchOrderInstallmentStatus.APPROVED,
            firstPaymentRequired: true,
            firstPaymentConfirmed: false,
          },
          installmentEarlyPaymentRequests: {
            none: {
              status: { in: CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES },
              sentToCashierAt: { not: null },
            },
          },
        },
        {
          installmentEarlyPaymentRequests: {
            some: {
              status: { in: CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES },
              sentToCashierAt: { not: null },
            },
          },
        },
      ],
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
    return enriched
      .filter((invoice) => isBranchCashierInvoiceVisible(invoice))
      .map((invoice) => sanitizeBranchCashierInvoice(invoice));
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
    if (!invoice || !isBranchCashierInvoiceVisible(invoice)) {
      throw new NotFoundException('Счёт не найден');
    }
    const enriched = await this.attachLinkedRequest(invoice);
    return sanitizeBranchCashierInvoice(enriched);
  }

  async listCashierAccounts(user: AuthUser, paymentMethod?: string) {
    this.assertBranchCashier(user);
    return this.branchCashierPaymentService.listSelectableAccounts(user, paymentMethod);
  }

  async submitCashierPayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    this.assertBranchCashier(user);
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: { id, deletedAt: null, branchId: user.branchId! },
      include: { sale: { include: { installmentApproval: true } } },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    assertRetailSaleFinanceAllowed({
      invoiceStatus: invoice.status,
      installmentApproval: invoice.sale?.installmentApproval,
    });
    if (invoice && isRetailInstallmentInvoice(invoice)) {
      throw new BadRequestException('Для рассрочки используйте раздел «Рассрочка»');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.distributionService.submitInvoicePaymentInTx(tx, user, id, dto);
      if (invoice?.invoiceCategory === 'RETAIL_SALE' && invoice.saleId) {
        await this.salesService.syncRetailSalePaymentFromInvoiceInTx(tx, user, id);
      }
    });

    return this.getCashierInvoice(user, id);
  }

  async listCashierInstallments(user: AuthUser, query: BranchAccountantInvoiceQueryDto) {
    this.assertBranchCashier(user);
    const scope = query.scope ?? 'active';
    const where: Prisma.BranchInvoiceWhereInput = {
      deletedAt: null,
      branchId: user.branchId!,
      invoiceCategory: 'RETAIL_SALE',
      paymentType: BranchInvoicePaymentType.INSTALLMENT,
      sentToCashierAt: { not: null },
      status:
        scope === 'closed'
          ? {
              in: [
                BranchInvoiceStatus.ISSUED,
                BranchInvoiceStatus.PARTIALLY_PAID,
                BranchInvoiceStatus.OVERDUE,
                BranchInvoiceStatus.PAID,
              ],
            }
          : { in: [BranchInvoiceStatus.ISSUED, BranchInvoiceStatus.PARTIALLY_PAID, BranchInvoiceStatus.OVERDUE] },
    };
    if (query.search?.trim()) {
      where.OR = [
        { invoiceNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { sale: { receiptNumber: { contains: query.search.trim(), mode: 'insensitive' } } },
        { sale: { customer: { fullName: { contains: query.search.trim(), mode: 'insensitive' } } } },
      ];
    }

    const invoices = await this.prisma.branchInvoice.findMany({
      where,
      include: this.invoiceInclude(),
      orderBy: { sentToCashierAt: 'desc' },
    });

    return invoices
      .filter((invoice) => isRetailInstallmentInCashierScope(invoice, scope))
      .map((invoice) => sanitizeRetailInstallmentCashierInvoice(invoice));
  }

  async getCashierInstallment(user: AuthUser, id: string) {
    this.assertBranchCashier(user);
    const invoice = await this.prisma.branchInvoice.findFirst({
      where: {
        id,
        deletedAt: null,
        branchId: user.branchId!,
        invoiceCategory: 'RETAIL_SALE',
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        sentToCashierAt: { not: null },
      },
      include: this.invoiceInclude(),
    });
    if (!invoice || !isRetailInstallmentInCashierScope(invoice, 'all')) {
      throw new NotFoundException('Рассрочка не найдена');
    }
    return sanitizeRetailInstallmentCashierInvoice(invoice);
  }

  async submitCashierInstallmentPayment(user: AuthUser, id: string, dto: AddBranchPaymentDto) {
    this.assertBranchCashier(user);
    await this.salesService.receiveRetailInstallmentCashierPayment(user, id, dto);
    return this.getCashierInstallment(user, id);
  }

  async listEarlyPaymentRequests(user: AuthUser, invoiceId: string) {
    return this.earlyPaymentService.listForInvoice(user, invoiceId);
  }

  async createEarlyPaymentRequest(user: AuthUser, invoiceId: string, dto: CreateInstallmentEarlyPaymentDto) {
    await this.earlyPaymentService.createRequest(user, invoiceId, dto);
    return this.getInvoice(user, invoiceId);
  }

  async sendEarlyPaymentToCashier(user: AuthUser, invoiceId: string, requestId: string) {
    await this.earlyPaymentService.sendToCashier(user, invoiceId, requestId);
    return this.getInvoice(user, invoiceId);
  }
}
