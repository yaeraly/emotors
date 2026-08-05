import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FileAttachmentEntityType,
  FinanceExpenseStatus,
  ProcurementSupplierPaymentLedgerStatus,
  ProcurementSupplierPaymentStatus,
  Role,
  TransportExpenseStatus,
  TransportExpenseType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { FinanceExpensesService } from '../finance/finance-expenses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { canCreateSupplierPayment, canPermanentDeleteBusinessData, hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import {
  AccountantBillListItem,
  AccountantBillRequestType,
  AccountantBillSource,
  AccountantBillUiStatus,
  buildAccountantBillsSummary,
  estimateKgsAmount,
  mapFinanceCategoryToRequestType,
  mapFinanceExpenseStatusToUi,
  mapSupplierInvoiceToUi,
  mapTransportExpenseTypeToRequestType,
  mapTransportStatusToUi,
  matchesBillSearch,
  paginateItems,
} from './accountant-bills.util';
import { SupplierPaymentWorkflowService } from './supplier-payment-workflow.service';
import { TransportExpenseService } from './transport-expense.service';
import type { PermanentDeleteHqPaymentDto } from './dto/permanent-delete-hq-payment.dto';

export type AccountantBillsQuery = {
  requestType?: string;
  senderId?: string;
  departmentOrBranch?: string;
  currency?: string;
  status?: string;
  recipient?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class AccountantBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly supplierPayments: SupplierPaymentWorkflowService,
    private readonly transportExpenses: TransportExpenseService,
    private readonly financeExpenses: FinanceExpensesService,
  ) {}

  async list(user: AuthUser, query: AccountantBillsQuery = {}) {
    this.assertAccountant(user);
    const items = await this.collectBills(user);
    const filtered = this.applyFilters(items, query);
    const page = paginateItems(filtered, query.page ?? 1, query.pageSize ?? 20);
    return {
      ...page,
      summary: buildAccountantBillsSummary(filtered),
    };
  }

  async summary(user: AuthUser, query: AccountantBillsQuery = {}) {
    this.assertAccountant(user);
    const items = this.applyFilters(await this.collectBills(user), query);
    return buildAccountantBillsSummary(items);
  }

  async getOne(user: AuthUser, source: AccountantBillSource, id: string) {
    this.assertAccountant(user);
    if (source === 'SUPPLIER_INVOICE') {
      return this.getSupplierDetail(user, id);
    }
    if (source === 'TRANSPORT_EXPENSE') {
      return this.getTransportDetail(user, id);
    }
    if (source === 'FINANCE_EXPENSE') {
      return this.getFinanceDetail(id);
    }
    throw new BadRequestException('Unknown bill source');
  }

  async takeForReview(user: AuthUser, source: AccountantBillSource, id: string) {
    this.assertAccountant(user);
    if (source === 'SUPPLIER_INVOICE') {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({
          where: { id, deletedAt: null },
          include: {
            invoiceSentBy: { select: { id: true, fullName: true, role: true } },
            supplier: { select: { id: true, name: true } },
          },
        });
        if (!order?.invoiceSentToAccountantAt) {
          throw new NotFoundException('Supplier invoice request not found');
        }
        if (['RETURNED', 'REJECTED', 'APPROVED'].includes(String(order.invoiceReviewStatus || ''))) {
          throw new BadRequestException('Request cannot be taken for review in current status');
        }
        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            invoiceReviewStatus: 'UNDER_REVIEW',
            invoiceReviewedAt: new Date(),
            invoiceReviewedById: user.id,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_UNDER_REVIEW', id, {
          invoiceReviewStatus: order.invoiceReviewStatus,
        }, { invoiceReviewStatus: 'UNDER_REVIEW' });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.PAYABLE_REQUEST_UNDER_REVIEW,
          entityType: 'ProcurementOrder',
          entityId: id,
          referenceNumber: order.orderNumber,
          message: `HQ Accountant took supplier invoice for order ${order.orderNumber} under review.`,
        });
        return { id: updated.id, source, status: 'UNDER_REVIEW' };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      return this.prisma.$transaction(async (tx) => {
        const expense = await tx.procurementTransportExpense.findUnique({
          where: { id },
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
            procurementOrder: { select: { orderNumber: true } },
          },
        });
        if (!expense) throw new NotFoundException('Transport expense not found');
        if (
          expense.status !== TransportExpenseStatus.WAITING_ACCOUNTANT &&
          expense.status !== TransportExpenseStatus.UNDER_REVIEW
        ) {
          throw new BadRequestException('Expense cannot be taken for review in current status');
        }
        const updated = await tx.procurementTransportExpense.update({
          where: { id },
          data: {
            status: TransportExpenseStatus.UNDER_REVIEW,
            accountantId: user.id,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_UNDER_REVIEW', id, {
          status: expense.status,
        }, { status: updated.status });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.PAYABLE_REQUEST_UNDER_REVIEW,
          entityType: 'ProcurementTransportExpense',
          entityId: id,
          referenceNumber: expense.expenseNumber,
          message: `HQ Accountant took transport request ${expense.expenseNumber} under review.`,
        });
        return { id: updated.id, source, status: 'UNDER_REVIEW' };
      });
    }

    throw new BadRequestException('Take for review is not supported for this request type');
  }

  async returnForCorrection(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    reason: string,
  ) {
    this.assertAccountant(user);
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 3) {
      throw new BadRequestException('Return reason is required');
    }

    if (source === 'SUPPLIER_INVOICE') {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null } });
        if (!order?.invoiceSentToAccountantAt) {
          throw new NotFoundException('Supplier invoice request not found');
        }
        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            invoiceReviewStatus: 'RETURNED',
            invoiceReturnReason: trimmed,
            invoiceRejectReason: null,
            invoiceReviewedAt: new Date(),
            invoiceReviewedById: user.id,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_RETURNED', id, {
          invoiceReviewStatus: order.invoiceReviewStatus,
        }, { invoiceReviewStatus: 'RETURNED', reason: trimmed });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.TRANSPORT_EXPENSE_RETURNED,
          entityType: 'ProcurementOrder',
          entityId: id,
          referenceNumber: order.orderNumber,
          message: `Supplier invoice for ${order.orderNumber} returned for correction: ${trimmed}`,
        });
        return { id: updated.id, source, status: 'RETURNED', reason: trimmed };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      return this.transportExpenses.returnToCreator(user, id, { reason: trimmed });
    }

    throw new BadRequestException('Return is not supported for this request type');
  }

  async reject(user: AuthUser, source: AccountantBillSource, id: string, reason: string) {
    this.assertAccountant(user);
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 3) {
      throw new BadRequestException('Reject reason is required');
    }

    if (source === 'SUPPLIER_INVOICE') {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null } });
        if (!order?.invoiceSentToAccountantAt) {
          throw new NotFoundException('Supplier invoice request not found');
        }
        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            invoiceReviewStatus: 'REJECTED',
            invoiceRejectReason: trimmed,
            invoiceReviewedAt: new Date(),
            invoiceReviewedById: user.id,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_REJECTED', id, {
          invoiceReviewStatus: order.invoiceReviewStatus,
        }, { invoiceReviewStatus: 'REJECTED', reason: trimmed });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.PAYABLE_REQUEST_REJECTED,
          entityType: 'ProcurementOrder',
          entityId: id,
          referenceNumber: order.orderNumber,
          message: `Supplier invoice for ${order.orderNumber} was rejected: ${trimmed}`,
        });
        return { id: updated.id, source, status: 'REJECTED', reason: trimmed };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      return this.prisma.$transaction(async (tx) => {
        const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
        if (!expense) throw new NotFoundException('Transport expense not found');
        if (
          ![
            TransportExpenseStatus.WAITING_ACCOUNTANT,
            TransportExpenseStatus.UNDER_REVIEW,
            TransportExpenseStatus.RETURNED,
          ].includes(expense.status as any)
        ) {
          throw new BadRequestException('Expense cannot be rejected in current status');
        }
        const updated = await tx.procurementTransportExpense.update({
          where: { id },
          data: {
            status: TransportExpenseStatus.REJECTED,
            returnReason: trimmed,
            accountantId: user.id,
            returnedAt: new Date(),
            returnedById: user.id,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_REJECTED', id, {
          status: expense.status,
        }, { status: updated.status, reason: trimmed });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.PAYABLE_REQUEST_REJECTED,
          entityType: 'ProcurementTransportExpense',
          entityId: id,
          referenceNumber: expense.expenseNumber,
          message: `Transport request ${expense.expenseNumber} was rejected: ${trimmed}`,
        });
        return { id: updated.id, source, status: 'REJECTED', reason: trimmed };
      });
    }

    throw new BadRequestException('Reject is not supported for this request type');
  }

  async approve(user: AuthUser, source: AccountantBillSource, id: string, body: any = {}) {
    this.assertAccountant(user);
    if (source === 'SUPPLIER_INVOICE') {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({ where: { id, deletedAt: null } });
        if (!order?.invoiceSentToAccountantAt) {
          throw new NotFoundException('Supplier invoice request not found');
        }
        if (order.invoiceReviewStatus === 'REJECTED') {
          throw new BadRequestException('Rejected invoice cannot be approved');
        }
        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            invoiceReviewStatus: 'APPROVED',
            invoiceReviewedAt: new Date(),
            invoiceReviewedById: user.id,
            invoiceReturnReason: null,
            invoiceRejectReason: null,
          },
        });
        await this.audit(tx, user, 'PAYABLE_REQUEST_APPROVED', id, {
          invoiceReviewStatus: order.invoiceReviewStatus,
        }, { invoiceReviewStatus: 'APPROVED' });
        await this.notifySenderRoles(tx, user, {
          type: AlertType.PAYABLE_REQUEST_APPROVED,
          entityType: 'ProcurementOrder',
          entityId: id,
          referenceNumber: order.orderNumber,
          message: `Supplier invoice for ${order.orderNumber} was approved by HQ Accountant.`,
        });
        return { id: updated.id, source, status: 'APPROVED' };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      return this.transportExpenses.approveAndSendToCashier(user, id, {
        exchangeRate: body.exchangeRate,
        financeAccountId: body.financeAccountId,
        accountantComment: body.accountantComment,
        sendToCashier: body.sendToCashier !== false,
      });
    }

    throw new BadRequestException('Approve is not supported for this request type');
  }

  /**
   * Postpone Supplier / Cargo (transport) payment without creating a ledger transaction.
   * Remaining debt is unchanged; only next payment date + comment are stored.
   */
  async postponePayment(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    body: { nextPaymentDate?: string; comment?: string } = {},
  ) {
    this.assertAccountant(user);
    const nextPaymentDateRaw = String(body.nextPaymentDate || '').trim();
    if (!nextPaymentDateRaw) {
      throw new BadRequestException('nextPaymentDate is required');
    }
    const nextPaymentDate = new Date(nextPaymentDateRaw);
    if (Number.isNaN(nextPaymentDate.getTime())) {
      throw new BadRequestException('nextPaymentDate is invalid');
    }
    const comment = String(body.comment || '').trim();
    if (!comment) {
      throw new BadRequestException('comment is required');
    }

    if (source === 'SUPPLIER_INVOICE') {
      return this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({
          where: { id, deletedAt: null },
          include: {
            supplierPayments: {
              select: { amountYuan: true, status: true, actualPaidKgs: true, amountKgs: true },
            },
          },
        });
        if (!order?.invoiceSentToAccountantAt) {
          throw new NotFoundException('Supplier invoice request not found');
        }
        if (order.invoiceReviewStatus === 'REJECTED') {
          throw new BadRequestException('Rejected invoice cannot be postponed');
        }
        const paidYuan = order.supplierPayments
          .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
          .reduce((sum, p) => sum + Number(p.amountYuan || 0), 0);
        const remainingYuan = Math.max(Number(order.totalYuan) - paidYuan, 0);
        if (remainingYuan <= 0.009) {
          throw new BadRequestException('Fully paid supplier invoice cannot be postponed');
        }

        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
            expectedPaymentDate: nextPaymentDate,
            paymentPostponeComment: comment,
            invoiceReviewStatus: order.invoiceReviewStatus === 'UNDER_REVIEW' ? 'APPROVED' : order.invoiceReviewStatus,
            invoiceReviewedAt: order.invoiceReviewedAt ?? new Date(),
            invoiceReviewedById: order.invoiceReviewedById ?? user.id,
          },
        });

        await this.audit(tx, user, 'PAYMENT_POSTPONED', id, {
          supplierPaymentStatus: order.supplierPaymentStatus,
          expectedPaymentDate: order.expectedPaymentDate,
        }, {
          supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
          expectedPaymentDate: nextPaymentDate.toISOString(),
          paymentPostponeComment: comment,
          paidAmount: paidYuan,
          remainingAmount: remainingYuan,
          procurementOrderId: order.id,
          supplierInvoiceId: order.id,
        });

        const isOverdue = nextPaymentDate.getTime() < Date.now();
        await this.notifySenderRoles(tx, user, {
          type: AlertType.SUPPLIER_PAYMENT_DUE,
          entityType: 'ProcurementOrder',
          entityId: id,
          referenceNumber: order.orderNumber,
          message: isOverdue
            ? `Просроченная задолженность поставщику по заказу ${order.orderNumber}.`
            : `Оплата поставщику по заказу ${order.orderNumber} отложена до ${nextPaymentDate.toISOString().slice(0, 10)}.`,
          recipientRoles: [Role.HQ_ACCOUNTANT, Role.CEO, Role.FINANCE_MANAGER],
        });

        return {
          id: updated.id,
          source,
          status: 'PAYMENT_POSTPONED',
          nextPaymentDate: nextPaymentDate.toISOString(),
          comment,
          remainingAmount: remainingYuan,
        };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      return this.prisma.$transaction(async (tx) => {
        const expense = await tx.procurementTransportExpense.findUnique({
          where: { id },
          include: { procurementOrder: { select: { id: true, orderNumber: true } } },
        });
        if (!expense) throw new NotFoundException('Transport expense not found');
        if (
          expense.status === TransportExpenseStatus.PAID ||
          expense.status === TransportExpenseStatus.CANCELLED ||
          expense.status === TransportExpenseStatus.REJECTED
        ) {
          throw new BadRequestException('Transport expense cannot be postponed in current status');
        }

        const amountKgs = Number(expense.amountKgs || expense.amount || 0);
        const paidAmountKgs = Number(expense.paidAmountKgs || 0);
        const remainingAmountKgs = Math.max(amountKgs - paidAmountKgs, 0);
        if (remainingAmountKgs <= 0.009) {
          throw new BadRequestException('Fully paid transport expense cannot be postponed');
        }

        const updated = await tx.procurementTransportExpense.update({
          where: { id },
          data: {
            status: TransportExpenseStatus.PAYMENT_POSTPONED,
            dueDate: nextPaymentDate,
            accountantComment: comment,
            accountantId: user.id,
            // Clear cashier queue — postpone must not keep a pending payment task.
            sentToCashierAt: null,
            executionStatus: null,
            executionStartedAt: null,
            failureReason: null,
            cashierId: null,
          },
        });

        const auditAction =
          expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
            ? 'PAYMENT_POSTPONED'
            : 'PAYMENT_POSTPONED';
        await this.audit(tx, user, auditAction, id, {
          status: expense.status,
          dueDate: expense.dueDate,
        }, {
          status: TransportExpenseStatus.PAYMENT_POSTPONED,
          dueDate: nextPaymentDate.toISOString(),
          comment,
          paidAmount: paidAmountKgs,
          remainingAmount: remainingAmountKgs,
          procurementOrderId: expense.procurementOrderId,
          cargoInvoiceId: expense.id,
          expenseType: expense.expenseType,
          requestType: mapTransportExpenseTypeToRequestType(expense.expenseType),
        });

        const requestLabel =
          expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
            ? 'карго'
            : expense.expenseType === TransportExpenseType.LOCAL_DELIVERY
              ? 'внутреннему транспорту'
              : 'транспорту';
        const isOverdue = nextPaymentDate.getTime() < Date.now();
        await this.notifySenderRoles(tx, user, {
          type: AlertType.TRANSPORT_EXPENSE_SUBMITTED,
          entityType: 'ProcurementTransportExpense',
          entityId: id,
          referenceNumber: expense.expenseNumber,
          message: isOverdue
            ? `Просроченная задолженность ${requestLabel} по счёту ${expense.expenseNumber}.`
            : `Оплата ${requestLabel} по счёту ${expense.expenseNumber} отложена до ${nextPaymentDate.toISOString().slice(0, 10)}.`,
          recipientRoles: [Role.HQ_ACCOUNTANT, Role.CEO, Role.FINANCE_MANAGER],
        });

        return {
          id: updated.id,
          source,
          status: 'PAYMENT_POSTPONED',
          nextPaymentDate: nextPaymentDate.toISOString(),
          comment,
          remainingAmount: remainingAmountKgs,
          relatedOrderNumber: expense.procurementOrder?.orderNumber ?? null,
        };
      });
    }

    throw new BadRequestException('Postpone is not supported for this request type');
  }

  async permanentlyDelete(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    dto: PermanentDeleteHqPaymentDto,
  ) {
    if (!canPermanentDeleteBusinessData(user)) {
      throw new ForbiddenException('Only HQ SysAdmin can permanently delete payments');
    }
    if (source === 'SUPPLIER_INVOICE') {
      const paymentId = String(dto.paymentId || '').trim();
      if (!paymentId) {
        throw new BadRequestException('paymentId is required to delete a supplier payment');
      }
      return this.supplierPayments.permanentlyDeletePayment(user, id, paymentId, dto);
    }
    if (source === 'TRANSPORT_EXPENSE') {
      return this.transportExpenses.permanentlyDelete(user, id, dto);
    }
    if (source === 'FINANCE_EXPENSE') {
      return this.financeExpenses.permanentlyDelete(user, id, dto);
    }
    throw new BadRequestException('Permanent delete is not supported for this request type');
  }

  private assertAccountant(user: AuthUser) {
    if (!canCreateSupplierPayment(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only HQ Accountant can access bills to pay');
    }
  }

  private async collectBills(user: AuthUser): Promise<AccountantBillListItem[]> {
    const [supplierOrders, transportRows, financeRows] = await Promise.all([
      this.prisma.procurementOrder.findMany({
        where: {
          deletedAt: null,
          invoiceSentToAccountantAt: { not: null },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          invoiceSentBy: { select: { id: true, fullName: true, role: true } },
          supplierPayments: {
            select: {
              amountYuan: true,
              amountKgs: true,
              actualPaidKgs: true,
              status: true,
              exchangeRate: true,
            },
          },
        },
        orderBy: { invoiceSentToAccountantAt: 'desc' },
        take: 500,
      }),
      this.prisma.procurementTransportExpense.findMany({
        where: {
          status: {
            in: [
              TransportExpenseStatus.WAITING_ACCOUNTANT,
              TransportExpenseStatus.UNDER_REVIEW,
              TransportExpenseStatus.RETURNED,
              TransportExpenseStatus.REJECTED,
              TransportExpenseStatus.PENDING_CASHIER,
              TransportExpenseStatus.PARTIALLY_PAID,
              TransportExpenseStatus.PAYMENT_POSTPONED,
              TransportExpenseStatus.PAID,
            ],
          },
        },
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          transportCompany: { select: { id: true, name: true } },
          procurementOrder: { select: { id: true, orderNumber: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 500,
      }),
      this.prisma.financeExpense.findMany({
        where: {
          status: {
            in: [
              FinanceExpenseStatus.PENDING_APPROVAL,
              FinanceExpenseStatus.APPROVED,
              FinanceExpenseStatus.REJECTED,
              FinanceExpenseStatus.PAID,
            ],
          },
        },
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const supplierItems: AccountantBillListItem[] = supplierOrders.map((order) => {
      const paidYuan = order.supplierPayments
        .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
        .reduce((sum, p) => sum + Number(p.amountYuan || 0), 0);
      const paidKgs = order.supplierPayments
        .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
        .reduce(
          (sum, p) =>
            sum + Number(p.actualPaidKgs != null ? p.actualPaidKgs : p.amountKgs || 0),
          0,
        );
      const requested = Number(order.requestedPaymentYuan ?? order.remainingYuan ?? order.totalYuan ?? 0);
      const remainingYuan = Math.max(Number(order.totalYuan) - paidYuan, 0);
      const latestRate =
        order.supplierPayments
          .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
          .map((p) => Number(p.exchangeRate || 0))
          .filter((rate) => rate > 0)
          .at(-1) ?? Number(order.weightedAverageYuanRate || order.defaultYuanRate || 0);
      const estimatedKgs = estimateKgsAmount(requested, 'CNY', latestRate);
      const remainingKgs = estimateKgsAmount(remainingYuan, 'CNY', latestRate);
      const status = mapSupplierInvoiceToUi({
        invoiceReviewStatus: order.invoiceReviewStatus,
        supplierPaymentStatus: order.supplierPaymentStatus,
        remainingYuan,
      });
      const due = order.expectedPaymentDate ? new Date(order.expectedPaymentDate) : null;
      return {
        id: order.id,
        source: 'SUPPLIER_INVOICE',
        requestNumber: order.orderNumber,
        requestType: 'SUPPLIER_PAYMENT',
        submittedAt: order.invoiceSentToAccountantAt?.toISOString() ?? null,
        sender: order.invoiceSentBy
          ? {
              id: order.invoiceSentBy.id,
              fullName: order.invoiceSentBy.fullName,
              role: order.invoiceSentBy.role,
            }
          : null,
        departmentOrBranch: 'Supply / Procurement',
        recipientName: order.supplier?.name || 'Supplier',
        basis: `${order.orderNumber} · ${order.supplier?.name || 'Supplier'}`,
        amount: requested,
        currency: 'CNY',
        estimatedAmountKgs: estimatedKgs,
        paidAmount: paidYuan,
        paidAmountKgs: paidKgs,
        remainingAmount: remainingYuan,
        remainingAmountKgs: remainingKgs,
        status,
        isOverdue: Boolean(due && due.getTime() < Date.now() && remainingYuan > 0.009),
        nextPaymentDate: order.expectedPaymentDate?.toISOString?.() ?? null,
        paymentPostponeComment: (order as { paymentPostponeComment?: string | null }).paymentPostponeComment ?? null,
        relatedEntityType: 'ProcurementOrder',
        relatedEntityId: order.id,
        relatedOrderNumber: order.orderNumber,
        href: `/procurement/orders/${order.id}?tab=payments`,
      };
    });

    const transportItems: AccountantBillListItem[] = transportRows.map((row) => {
      const amount = Number(row.amount);
      const paid = Number(row.paidAmountKgs || 0);
      const amountKgs =
        Number(row.amountKgs) > 0
          ? Number(row.amountKgs)
          : estimateKgsAmount(amount, row.currency, row.exchangeRate != null ? Number(row.exchangeRate) : null);
      const remainingKgs = Math.max(amountKgs - paid, 0);
      const currency = String(row.currency || 'KGS').toUpperCase();
      const remainingAmount =
        currency === 'KGS'
          ? remainingKgs
          : Math.max(amount - (amountKgs > 0 ? (paid / amountKgs) * amount : 0), 0);
      const due = row.dueDate ? new Date(row.dueDate) : null;
      return {
        id: row.id,
        source: 'TRANSPORT_EXPENSE',
        requestNumber: row.expenseNumber,
        requestType: mapTransportExpenseTypeToRequestType(row.expenseType),
        submittedAt: (row.submittedAt ?? row.createdAt)?.toISOString?.() ?? null,
        sender: row.createdBy
          ? { id: row.createdBy.id, fullName: row.createdBy.fullName, role: row.createdBy.role }
          : null,
        departmentOrBranch: 'Supply / Procurement',
        recipientName: row.transportCompany?.name || row.recipientName || row.supplierCarrier,
        basis: row.procurementOrder?.orderNumber
          ? `${row.procurementOrder.orderNumber} · ${row.expenseType}`
          : row.expenseName || row.expenseType,
        amount,
        currency,
        estimatedAmountKgs: amountKgs,
        paidAmount: currency === 'KGS' ? paid : Number(((paid / Math.max(amountKgs, 0.01)) * amount).toFixed(2)),
        paidAmountKgs: paid,
        remainingAmount: Number(remainingAmount.toFixed(2)),
        remainingAmountKgs: remainingKgs,
        status: mapTransportStatusToUi(row.status),
        isOverdue: Boolean(due && due.getTime() < Date.now() && remainingKgs > 0.009),
        nextPaymentDate: row.dueDate?.toISOString?.() ?? null,
        paymentPostponeComment: row.accountantComment ?? row.comment ?? null,
        relatedEntityType: 'ProcurementTransportExpense',
        relatedEntityId: row.id,
        relatedOrderNumber: row.procurementOrder?.orderNumber ?? null,
        href: row.procurementOrderId
          ? `/procurement/orders/${row.procurementOrderId}?tab=transport`
          : `/finance/bills-to-pay?source=TRANSPORT_EXPENSE&id=${row.id}`,
      };
    });

    const financeItems: AccountantBillListItem[] = financeRows.map((row) => {
      const amount = Number(row.amount);
      const currency = String(row.currency || 'KGS').toUpperCase();
      const amountKgs = estimateKgsAmount(amount, currency, 1);
      const status = mapFinanceExpenseStatusToUi(row.status);
      const paidKgs = status === 'FULLY_PAID' ? amountKgs : 0;
      return {
        id: row.id,
        source: 'FINANCE_EXPENSE',
        requestNumber: row.expenseNumber,
        requestType: mapFinanceCategoryToRequestType(row.category),
        submittedAt: row.createdAt.toISOString(),
        sender: row.createdBy
          ? { id: row.createdBy.id, fullName: row.createdBy.fullName, role: row.createdBy.role }
          : null,
        departmentOrBranch: row.branch?.name || 'HQ Finance',
        recipientName: row.payee || row.category,
        basis: row.purpose || row.documentNumber || row.category,
        amount,
        currency,
        estimatedAmountKgs: amountKgs,
        paidAmount: paidKgs,
        paidAmountKgs: paidKgs,
        remainingAmount: status === 'FULLY_PAID' ? 0 : amount,
        remainingAmountKgs: status === 'FULLY_PAID' ? 0 : amountKgs,
        status,
        isOverdue: false,
        relatedEntityType: 'FinanceExpense',
        relatedEntityId: row.id,
        relatedOrderNumber: row.documentNumber,
        href: `/finance/expenses`,
      };
    });

    return [...supplierItems, ...transportItems, ...financeItems].sort((a, b) => {
      const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  private applyFilters(items: AccountantBillListItem[], query: AccountantBillsQuery) {
    return items.filter((item) => {
      if (query.requestType && item.requestType !== query.requestType) return false;
      if (query.senderId && item.sender?.id !== query.senderId) return false;
      if (
        query.departmentOrBranch &&
        !(item.departmentOrBranch || '').toLowerCase().includes(query.departmentOrBranch.toLowerCase())
      ) {
        return false;
      }
      if (query.currency && item.currency.toUpperCase() !== query.currency.toUpperCase()) return false;
      if (query.status && item.status !== query.status) return false;
      if (
        query.recipient &&
        !item.recipientName.toLowerCase().includes(query.recipient.toLowerCase())
      ) {
        return false;
      }
      if (query.dateFrom) {
        const from = new Date(query.dateFrom).getTime();
        const submitted = item.submittedAt ? new Date(item.submittedAt).getTime() : 0;
        if (submitted < from) return false;
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo).getTime();
        const submitted = item.submittedAt ? new Date(item.submittedAt).getTime() : 0;
        if (submitted > to) return false;
      }
      if (query.search && !matchesBillSearch(item, query.search)) return false;
      return true;
    });
  }

  private async getSupplierDetail(user: AuthUser, id: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        invoiceSentBy: { select: { id: true, fullName: true, role: true } },
        supplierPayments: {
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
            accountant: { select: { id: true, fullName: true } },
            cashier: { select: { id: true, fullName: true } },
            intendedFinanceAccount: { select: { id: true, name: true } },
            actualFinanceAccount: { select: { id: true, name: true } },
            attachments: { where: { deletedAt: null } },
          },
          orderBy: { sequenceNumber: 'asc' },
        },
        paymentInfoVersions: {
          where: { isActive: true },
        },
      },
    });
    if (!order?.invoiceSentToAccountantAt) {
      throw new NotFoundException('Supplier invoice request not found');
    }

    const activeInfo = order.paymentInfoVersions[0] ?? null;
    const qrCodes = activeInfo
      ? await this.prisma.fileAttachment.findMany({
          where: {
            entityType: FileAttachmentEntityType.PAYMENT_QR,
            entityId: activeInfo.id,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const listItem = (await this.collectBills(user)).find(
      (item) => item.source === 'SUPPLIER_INVOICE' && item.id === id,
    );

    const audits = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'ProcurementOrder', entityId: id },
          { entity: 'ProcurementSupplierPayment', entityId: { in: order.supplierPayments.map((p) => p.id) } },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return {
      ...listItem,
      detail: {
        requestNumber: order.orderNumber,
        requestType: 'SUPPLIER_PAYMENT' as AccountantBillRequestType,
        submissionDate: order.invoiceSentToAccountantAt,
        sender: order.invoiceSentBy,
        departmentOrBranch: 'Supply / Procurement',
        recipient: order.supplier?.name,
        relatedDocument: order.orderNumber,
        totalYuan: Number(order.totalYuan),
        requestedPaymentYuan: order.requestedPaymentYuan != null ? Number(order.requestedPaymentYuan) : null,
        totalPaidYuan: Number(order.totalPaidYuan),
        remainingYuan: Number(order.remainingYuan),
        paymentMethod: activeInfo?.paymentMethod ?? null,
        bankName: activeInfo?.bankName ?? null,
        accountHolder: activeInfo?.accountHolder ?? null,
        accountNumber: activeInfo?.accountNumber ?? null,
        qrCodes,
        invoiceReviewStatus: order.invoiceReviewStatus,
        invoiceReturnReason: order.invoiceReturnReason,
        invoiceRejectReason: order.invoiceRejectReason,
        supplier: order.supplier,
        payments: order.supplierPayments.map((payment) =>
          this.supplierPayments.toPaymentResponse(payment),
        ),
        auditHistory: audits,
      },
    };
  }

  private async getTransportDetail(user: AuthUser, id: string) {
    const detail = await this.transportExpenses.getOne(user, id);
    const listItem = (await this.collectBills(user)).find(
      (item) => item.source === 'TRANSPORT_EXPENSE' && item.id === id,
    );
    const audits = await this.prisma.auditLog.findMany({
      where: { entity: 'ProcurementTransportExpense', entityId: id },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    return {
      ...listItem,
      detail: {
        ...detail,
        auditHistory: audits,
        cargo:
          detail.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
            ? {
                totalWeightKg: detail.totalWeightKg,
                cargoRateUsdPerKg: detail.cargoRateUsdPerKg,
                usdExchangeRate: detail.usdExchangeRate,
                calculatedAmountUsd: detail.calculatedAmountUsd,
                calculatedAmountKgs: detail.calculatedAmountKgs,
                cargoReceipts: detail.cargoReceipts,
              }
            : null,
      },
    };
  }

  private async getFinanceDetail(id: string) {
    const expense = await this.prisma.financeExpense.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
        branch: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new NotFoundException('Finance expense not found');
    return {
      id: expense.id,
      source: 'FINANCE_EXPENSE' as const,
      requestType: mapFinanceCategoryToRequestType(expense.category),
      status: mapFinanceExpenseStatusToUi(expense.status),
      detail: {
        ...expense,
        amount: Number(expense.amount),
      },
    };
  }

  private async notifySenderRoles(
    tx: any,
    user: AuthUser,
    input: {
      type: AlertType;
      entityType: string;
      entityId: string;
      referenceNumber?: string;
      message: string;
      recipientRoles?: Role[];
    },
  ) {
    await this.notifications.notifyInTx(tx, user, {
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      referenceNumber: input.referenceNumber,
      message: input.message,
      recipientRoles:
        input.recipientRoles ??
        [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER, Role.FINANCE_MANAGER],
    });
  }

  private async audit(
    tx: any,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'AccountantPayableBill',
        entityId,
        metadata: {
          actorId: user.id,
          actorRole: user.role,
          timestamp: new Date().toISOString(),
          oldValue,
          newValue,
        },
      },
    });
  }
}
