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
import { canCreateSupplierPayment, canPermanentDeleteBusinessData, canProcessHqCargoPayment, hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
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
import {
  resolveCargoApprovalStatus,
  resolveCargoPaymentStatusLabel,
} from './cargo-bill-actions.util';
import {
  resolveSupplierApprovalStatus,
  resolveSupplierPaymentStatusLabel,
} from './supplier-bill-actions.util';
import {
  resolveSupplierInvoiceCorrectionRouting,
  resolveTransportExpenseCorrectionRouting,
} from './accountant-bill-correction-routing.util';
import { resolveApprovedSupplierCostBaseYuan } from './procurement-cost.util';
import { roundMoney } from './supplier-payment.util';
import { isSupplierPaymentExchangeRateRevisionAllowed, resolveSupplierPaymentDialogDefaultExchangeRate, resolveSupplierPaymentDetailDisplayExchangeRate } from './supplier-payment-exchange-rate.util';
import { resolveSupplierPaymentMonetaryBalance } from './supplier-payment-balance.util';
import {
  resolveCargoCashierReturnedPaymentRequest,
  resolveLatestCashierReturnedSupplierPaymentRequest,
} from './payment-request-correction.util';
import { validateHqReceivingInvoicePrerequisites } from './hq-receiving-validation.util';
import { LandedCostService } from './landed-cost.service';
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
    private readonly landedCostService: LandedCostService,
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
    body: { reason?: string; comment?: string; idempotencyKey?: string } = {},
  ) {
    this.assertAccountant(user);
    const trimmed = body.reason?.trim();
    if (!trimmed || trimmed.length < 3) {
      throw new BadRequestException('Return reason is required');
    }

    if (source === 'SUPPLIER_INVOICE') {
      return this.supplierPayments.returnForCorrectionByAccountant(user, id, {
        reason: trimmed,
        comment: body.comment?.trim() || undefined,
        idempotencyKey: body.idempotencyKey,
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      const expense = await this.prisma.procurementTransportExpense.findUnique({
        where: { id },
        select: { expenseType: true },
      });
      if (expense?.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
        return this.transportExpenses.returnCargoForCorrection(user, id, {
          reason: trimmed,
          comment: body.comment?.trim() || undefined,
          idempotencyKey: body.idempotencyKey,
        });
      }
      if (expense?.expenseType === TransportExpenseType.LOCAL_DELIVERY) {
        return this.transportExpenses.returnKyrgyzstanTransportToSupplyManager(user, id, {
          reason: trimmed,
          comment: body.comment?.trim() || undefined,
          idempotencyKey: body.idempotencyKey,
        });
      }
      if (expense?.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT) {
        return this.transportExpenses.returnChinaDomesticTransportToSupplyManager(user, id, {
          reason: trimmed,
          comment: body.comment?.trim() || undefined,
          idempotencyKey: body.idempotencyKey,
        });
      }
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
        try {
          await this.landedCostService.recalculateProcurementOrder(
            id,
            {
              user,
              reason: 'supplier-invoice-approved',
              triggerReason: 'SUPPLIER_INVOICE_APPROVED_FOR_COST',
            },
            tx,
          );
        } catch {
          // Weight/finalized gates may block recalculation; approval remains source of truth.
        }
        return { id: updated.id, source, status: 'APPROVED' };
      });
    }

    if (source === 'TRANSPORT_EXPENSE') {
      const result = await this.transportExpenses.approveAndSendToCashier(user, id, {
        exchangeRate: body.exchangeRate,
        exchangeRateCnyKgs: body.exchangeRateCnyKgs,
        financeAccountId: body.financeAccountId,
        accountantComment: body.accountantComment,
        sendToCashier: body.sendToCashier !== false,
      });
      const expense = await this.prisma.procurementTransportExpense.findUnique({
        where: { id },
        select: {
          procurementOrderId: true,
          expenseNumber: true,
          procurementOrder: { select: { orderNumber: true } },
        },
      });
      if (expense?.procurementOrderId) {
        await this.prisma.$transaction(async (tx) => {
          await this.notifyWarehouseWhenExpensesProcessed(
            tx,
            user,
            expense.procurementOrderId!,
            expense.procurementOrder?.orderNumber ?? expense.expenseNumber,
          );
        });
      }
      return result;
    }

    throw new BadRequestException('Approve is not supported for this request type');
  }

  async payBill(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    body: {
      paymentAmountKgs?: number;
      financeAccountId?: string;
      accountantComment?: string;
      exchangeRateCnyKgs?: number;
      paidAt?: string;
      idempotencyKey?: string;
      payRemainder?: boolean;
      partialPayment?: boolean;
    },
  ) {
    this.assertAccountant(user);
    if (source === 'TRANSPORT_EXPENSE') {
      return this.payCargoPayment(user, source, id, body);
    }
    if (source === 'SUPPLIER_INVOICE') {
      const result = await this.supplierPayments.payByAccountant(user, id, {
        paymentAmountKgs: Number(body.paymentAmountKgs),
        financeAccountId: String(body.financeAccountId || ''),
        accountantComment: body.accountantComment,
        exchangeRateCnyKgs:
          body.exchangeRateCnyKgs != null ? Number(body.exchangeRateCnyKgs) : undefined,
        idempotencyKey: body.idempotencyKey,
        payRemainder: body.payRemainder === true,
        partialPayment: body.partialPayment === true,
      });
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.procurementOrder.findFirst({
          where: { id, deletedAt: null },
          select: { orderNumber: true },
        });
        if (order) {
          await this.notifyWarehouseWhenExpensesProcessed(tx, user, id, order.orderNumber);
        }
      });
      return result;
    }
    throw new BadRequestException('Payment is not supported for this request type');
  }

  async payCargoPayment(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    body: {
      paymentAmountKgs?: number;
      financeAccountId?: string;
      accountantComment?: string;
      paidAt?: string;
      idempotencyKey?: string;
    },
  ) {
    this.assertAccountant(user);
    if (source !== 'TRANSPORT_EXPENSE') {
      throw new BadRequestException('Cargo payment is only supported for transport expenses');
    }
    const expense = await this.prisma.procurementTransportExpense.findUnique({
      where: { id },
      select: { expenseType: true, procurementOrderId: true, expenseNumber: true },
    });
    if (!expense || expense.expenseType !== TransportExpenseType.INTERNATIONAL_FREIGHT) {
      throw new BadRequestException('Only cargo payment invoices can be paid from bills to pay');
    }
    const result = await this.transportExpenses.payCargoByAccountant(user, id, {
      paymentAmountKgs: Number(body.paymentAmountKgs),
      financeAccountId: String(body.financeAccountId || ''),
      accountantComment: body.accountantComment,
      paidAt: body.paidAt,
      idempotencyKey: body.idempotencyKey,
    });
    if (expense.procurementOrderId) {
      await this.prisma.$transaction(async (tx) => {
        await this.notifyWarehouseWhenExpensesProcessed(
          tx,
          user,
          expense.procurementOrderId!,
          expense.expenseNumber,
        );
      });
    }
    return result;
  }

  /**
   * Postpone Supplier / Cargo (transport) payment without creating a ledger transaction.
   * Remaining debt is unchanged; only next payment date + comment are stored.
   */
  async postponePayment(
    user: AuthUser,
    source: AccountantBillSource,
    id: string,
    body: { nextPaymentDate?: string; reason?: string; comment?: string } = {},
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
    const reason = String(body.reason || '').trim();
    const comment = String(body.comment || '').trim();

    if (source === 'SUPPLIER_INVOICE') {
      if (reason.length < 2) {
        throw new BadRequestException('Postpone reason is required');
      }
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
        const review = String(order.invoiceReviewStatus ?? '').toUpperCase();
        if (review === 'RETURNED') {
          throw new BadRequestException('Returned invoice cannot be postponed');
        }

        const pendingCashier = order.supplierPayments.some(
          (payment) => payment.status === ProcurementSupplierPaymentStatus.PENDING_CASHIER,
        );
        if (pendingCashier) {
          await tx.procurementSupplierPayment.updateMany({
            where: {
              procurementOrderId: order.id,
              status: ProcurementSupplierPaymentStatus.PENDING_CASHIER,
            },
            data: {
              status: ProcurementSupplierPaymentStatus.CANCELLED,
              sentToCashierAt: null,
              executionStatus: null,
            },
          });
        }

        const paidYuan = order.supplierPayments
          .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
          .reduce((sum, p) => sum + Number(p.amountYuan || 0), 0);
        const remainingYuan = Math.max(Number(order.totalYuan) - paidYuan, 0);
        if (remainingYuan <= 0.009) {
          throw new BadRequestException('Fully paid supplier invoice cannot be postponed');
        }

        const storedComment = comment
          ? `${reason}${comment ? `\n${comment}` : ''}`
          : reason;

        const updated = await tx.procurementOrder.update({
          where: { id },
          data: {
            supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
            expectedPaymentDate: nextPaymentDate,
            paymentPostponeComment: storedComment,
            invoiceReviewStatus:
              order.invoiceReviewStatus === 'UNDER_REVIEW' || order.invoiceReviewStatus === 'SUBMITTED'
                ? 'APPROVED'
                : order.invoiceReviewStatus,
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
          paymentPostponeComment: storedComment,
          postponeReason: reason,
          paidAmount: paidYuan,
          remainingAmount: remainingYuan,
          procurementOrderId: order.id,
          supplierInvoiceId: order.id,
        });

        await this.audit(tx, user, 'SUPPLIER_PAYMENT_POSTPONED', id, {
          supplierPaymentStatus: order.supplierPaymentStatus,
          paidAmount: paidYuan,
          remainingAmount: remainingYuan,
        }, {
          supplierPaymentId: null,
          invoiceId: order.id,
          procurementOrderId: order.id,
          paymentAmount: 0,
          approvedAmount: Number(order.totalYuan),
          paidAmount: paidYuan,
          remainingAmount: remainingYuan,
          previousStatus: order.supplierPaymentStatus,
          newStatus: ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
          nextPaymentDate: nextPaymentDate.toISOString(),
          correctionReason: reason,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
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
        await this.notifyWarehouseWhenExpensesProcessed(tx, user, order.id, order.orderNumber);

        try {
          await this.landedCostService.recalculateProcurementOrder(
            order.id,
            {
              user,
              reason: 'supplier-payment-postponed',
              triggerReason: 'POSTPONED_SUPPLIER_PAYMENT_INCLUDED_IN_COST',
            },
            tx,
          );
        } catch {
          // Weight/finalized gates may block recalculation; postpone + debt remain source of truth.
        }

        return {
          id: updated.id,
          source,
          status: 'PAYMENT_POSTPONED',
          nextPaymentDate: nextPaymentDate.toISOString(),
          comment: storedComment,
          reason,
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
        if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT && reason.length < 2) {
          throw new BadRequestException('Postpone reason is required');
        }
        if (
          expense.status === TransportExpenseStatus.PAID ||
          expense.status === TransportExpenseStatus.CANCELLED ||
          expense.status === TransportExpenseStatus.REJECTED
        ) {
          throw new BadRequestException('Transport expense cannot be postponed in current status');
        }

        const paidAmountKgs = Number(expense.paidAmountKgs || 0);
        const approvedAmountKgs =
          Number(expense.amountKgs) > 0
            ? Number(expense.amountKgs)
            : Number(expense.calculatedAmountKgs || expense.amount);
        const remainingAmountKgs = Math.max(approvedAmountKgs - paidAmountKgs, 0);
        if (remainingAmountKgs <= 0.009) {
          throw new BadRequestException('Fully paid transport expense cannot be postponed');
        }

        const amountKgs = approvedAmountKgs;
        const storedComment = reason
          ? `${reason}${comment ? `\n${comment}` : ''}`
          : comment || null;
        const updated = await tx.procurementTransportExpense.update({
          where: { id },
          data: {
            status: TransportExpenseStatus.PAYMENT_POSTPONED,
            dueDate: nextPaymentDate,
            accountantComment: storedComment,
            accountantId: user.id,
            amountKgs,
            approvedAt: expense.approvedAt ?? new Date(),
            exchangeRate: expense.usdExchangeRate ?? expense.exchangeRate,
            // Clear cashier queue — postpone must not keep a pending payment task.
            sentToCashierAt: null,
            cashierInstructionAmountKgs: null,
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
          comment: storedComment,
          postponeReason: reason || null,
          paidAmount: paidAmountKgs,
          remainingAmount: remainingAmountKgs,
          procurementOrderId: expense.procurementOrderId,
          cargoInvoiceId: expense.id,
          expenseType: expense.expenseType,
          requestType: mapTransportExpenseTypeToRequestType(expense.expenseType),
        });
        if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
          await this.audit(tx, user, 'CARGO_PAYMENT_POSTPONED', id, {
            status: expense.status,
            paidAmountKgs,
            remainingAmount: remainingAmountKgs,
          }, {
            cargoPaymentId: id,
            invoiceId: id,
            procurementOrderId: expense.procurementOrderId,
            paymentAmount: 0,
            oldPaidAmount: paidAmountKgs,
            newPaidAmount: paidAmountKgs,
            oldRemainingAmount: remainingAmountKgs,
            newRemainingAmount: remainingAmountKgs,
            nextPaymentDate: nextPaymentDate.toISOString(),
            correctionReason: reason || null,
            actorUserId: user.id,
            timestamp: new Date().toISOString(),
          });
        }

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
        if (expense.procurementOrderId) {
          await this.transportExpenses.syncApprovedSectionCostsInTx(tx, user, updated);
          await this.notifyWarehouseWhenExpensesProcessed(
            tx,
            user,
            expense.procurementOrderId,
            expense.procurementOrder?.orderNumber ?? expense.expenseNumber,
          );
        }

        return {
          id: updated.id,
          source,
          status: 'PAYMENT_POSTPONED',
          nextPaymentDate: nextPaymentDate.toISOString(),
          comment: storedComment,
          reason: reason || null,
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
    if (!canProcessHqCargoPayment(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only HQ Accountant can access bills to pay');
    }
  }

  private static readonly CORRECTION_USER_SELECT = {
    id: true,
    fullName: true,
    username: true,
    email: true,
    role: true,
  } as const;

  private async collectBills(user: AuthUser): Promise<AccountantBillListItem[]> {
    const [supplierOrders, transportRows, financeRows] = await Promise.all([
      this.prisma.procurementOrder.findMany({
        where: {
          deletedAt: null,
          invoiceSentToAccountantAt: { not: null },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          invoiceSentBy: { select: AccountantBillsService.CORRECTION_USER_SELECT },
          supplierPayments: {
            select: {
              amountYuan: true,
              amountKgs: true,
              actualPaidKgs: true,
              approvedAmountKgs: true,
              status: true,
              exchangeRate: true,
              executionStatus: true,
              returnedAt: true,
              sequenceNumber: true,
              returnedBy: { select: AccountantBillsService.CORRECTION_USER_SELECT },
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
          createdBy: { select: AccountantBillsService.CORRECTION_USER_SELECT },
          returnedBy: { select: AccountantBillsService.CORRECTION_USER_SELECT },
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
      const latestRate =
        order.supplierPayments
          .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
          .map((p) => Number(p.exchangeRate || 0))
          .filter((rate) => rate > 0)
          .at(-1) ?? Number(order.weightedAverageYuanRate || order.defaultYuanRate || 0);
      const paymentInputs = order.supplierPayments.map((payment) => ({
        amountYuan: Number(payment.amountYuan),
        exchangeRate: Number(payment.exchangeRate),
        amountKgs: Number(payment.amountKgs),
        actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
        approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
        status: payment.status,
      }));
      const monetaryBalance =
        latestRate > 0
          ? resolveSupplierPaymentMonetaryBalance({
              totalYuan: Number(order.totalYuan),
              exchangeRate: latestRate,
              payments: paymentInputs,
            })
          : null;
      const remainingYuan = monetaryBalance?.remainingCny ?? Math.max(Number(order.totalYuan) - paidYuan, 0);
      const remainingKgs =
        monetaryBalance?.remainingKgs ??
        estimateKgsAmount(remainingYuan, 'CNY', latestRate);
      const estimatedKgs =
        monetaryBalance?.obligationKgs ??
        estimateKgsAmount(requested, 'CNY', latestRate);
      const status = mapSupplierInvoiceToUi({
        invoiceReviewStatus: order.invoiceReviewStatus,
        supplierPaymentStatus: order.supplierPaymentStatus,
        remainingYuan,
        remainingKgs,
      });
      const due = order.expectedPaymentDate ? new Date(order.expectedPaymentDate) : null;
      const requestType = 'SUPPLIER_PAYMENT' as AccountantBillRequestType;
      const correctionRouting = resolveSupplierInvoiceCorrectionRouting({
        invoiceReviewStatus: order.invoiceReviewStatus,
        invoiceSentBy: order.invoiceSentBy,
        supplierPayments: order.supplierPayments,
      });
      return {
        id: order.id,
        source: 'SUPPLIER_INVOICE',
        requestNumber: order.orderNumber,
        requestType,
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
        correctionRouting,
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
      const requestType = mapTransportExpenseTypeToRequestType(row.expenseType);
      const correctionRouting = resolveTransportExpenseCorrectionRouting({
        requestType,
        status: row.status,
        executionStatus: row.executionStatus,
        returnedBy: row.returnedBy,
        supplyManager: row.createdBy,
      });
      return {
        id: row.id,
        source: 'TRANSPORT_EXPENSE',
        requestNumber: row.expenseNumber,
        requestType,
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
        correctionRouting,
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

    const paidYuan = order.supplierPayments
      .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
      .reduce((sum, p) => sum + Number(p.amountYuan || 0), 0);
    const paidKgs = order.supplierPayments
      .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
      .reduce(
        (sum, p) => sum + Number(p.actualPaidKgs != null ? p.actualPaidKgs : p.amountKgs || 0),
        0,
      );
    const exchangeRate =
      Number(order.weightedAverageYuanRate || order.defaultYuanRate || 0) > 0
        ? Number(order.weightedAverageYuanRate || order.defaultYuanRate)
        : order.supplierPayments
            .map((p) => Number(p.exchangeRate || 0))
            .filter((rate) => rate > 0)
            .at(-1) ?? 0;
    const paymentInputs = order.supplierPayments.map((payment) => ({
      amountYuan: Number(payment.amountYuan),
      exchangeRate: Number(payment.exchangeRate),
      amountKgs: Number(payment.amountKgs),
      actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
      approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
      status: payment.status,
    }));
    const exchangeRateEditable = isSupplierPaymentExchangeRateRevisionAllowed(
      audits.map((row) => ({ action: row.action, timestamp: row.timestamp })),
    );
    const paymentRateInputs = order.supplierPayments.map((payment) => ({
      exchangeRate: Number(payment.exchangeRate),
      status: payment.status,
      paidAt: payment.paidAt,
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
      sentToCashierAt: payment.sentToCashierAt,
    }));
    const invoiceRateInput = {
      defaultYuanRate: Number(order.defaultYuanRate || 0) || null,
      weightedAverageYuanRate:
        order.weightedAverageYuanRate != null ? Number(order.weightedAverageYuanRate) : null,
    };
    const exchangeRateDefaults = resolveSupplierPaymentDialogDefaultExchangeRate({
      payments: paymentRateInputs,
      ...invoiceRateInput,
    });
    const displayExchangeRateCnyKgs = resolveSupplierPaymentDetailDisplayExchangeRate({
      payments: paymentRateInputs,
      ...invoiceRateInput,
    });
    const cashierReturnedPaymentRequest = resolveLatestCashierReturnedSupplierPaymentRequest(
      order.supplierPayments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        executionStatus: payment.executionStatus,
        returnReason: payment.returnReason,
        amountYuan: Number(payment.amountYuan),
        amountKgs: Number(payment.amountKgs),
        approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
        exchangeRate: Number(payment.exchangeRate),
        returnedAt: payment.returnedAt,
        createdAt: payment.createdAt,
      })),
    );
    const monetaryBalance =
      exchangeRate > 0
        ? resolveSupplierPaymentMonetaryBalance({
            totalYuan: Number(order.totalYuan),
            exchangeRate,
            payments: paymentInputs,
          })
        : null;
    const supplierAmountCny = monetaryBalance?.obligationYuan ?? Number(order.totalYuan);
    const approvedAmountKgs = monetaryBalance?.obligationKgs ?? (exchangeRate > 0 ? roundMoney(supplierAmountCny * exchangeRate) : 0);
    const requested = Number(order.requestedPaymentYuan ?? order.remainingYuan ?? order.totalYuan ?? 0);
    const remainingYuan = monetaryBalance?.remainingCny ?? Math.max(Number(order.totalYuan) - paidYuan, 0);
    const remainingKgs =
      monetaryBalance?.remainingKgs ??
      (approvedAmountKgs > 0
        ? roundMoney(Math.max(approvedAmountKgs - paidKgs, 0))
        : estimateKgsAmount(remainingYuan, 'CNY', exchangeRate));
    const estimatedKgs = approvedAmountKgs > 0 ? approvedAmountKgs : estimateKgsAmount(requested, 'CNY', exchangeRate);
    const status = mapSupplierInvoiceToUi({
      invoiceReviewStatus: order.invoiceReviewStatus,
      supplierPaymentStatus: order.supplierPaymentStatus,
      remainingYuan,
      remainingKgs,
    });
    const due = order.expectedPaymentDate ? new Date(order.expectedPaymentDate) : null;

    // Always emit top-level bill fields so the UI can detect SUPPLIER_PAYMENT actions
    // without depending on collectBills() pagination/find.
    const listItem = {
      id: order.id,
      source: 'SUPPLIER_INVOICE' as const,
      requestNumber: order.orderNumber,
      requestType: 'SUPPLIER_PAYMENT' as AccountantBillRequestType,
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
      paymentPostponeComment:
        (order as { paymentPostponeComment?: string | null }).paymentPostponeComment ?? null,
      relatedEntityType: 'ProcurementOrder',
      relatedEntityId: order.id,
      relatedOrderNumber: order.orderNumber,
      href: `/procurement/orders/${order.id}?tab=payments`,
    };

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
        remainingYuan,
        exchangeRate,
        exchangeRateEditable,
        lastPaidExchangeRateCnyKgs: exchangeRateDefaults.lastPaidExchangeRateCnyKgs,
        defaultExchangeRateCnyKgs: exchangeRateDefaults.defaultExchangeRateCnyKgs,
        displayExchangeRateCnyKgs,
        cashierReturnedPaymentRequest,
        executionStatus: cashierReturnedPaymentRequest?.executionStatus ?? null,
        cashierReturnReason: cashierReturnedPaymentRequest?.returnReason ?? null,
        approvedAmountKgs,
        supplierAmountCny,
        paidAmountKgs: paidKgs,
        remainingAmountKgs: remainingKgs,
        paymentMethod: activeInfo?.paymentMethod ?? null,
        bankName: activeInfo?.bankName ?? null,
        accountHolder: activeInfo?.accountHolder ?? null,
        accountNumber: activeInfo?.accountNumber ?? null,
        qrCodes,
        invoiceReviewStatus: order.invoiceReviewStatus,
        invoiceReturnReason: order.invoiceReturnReason,
        invoiceRejectReason: order.invoiceRejectReason,
        approvalStatus: resolveSupplierApprovalStatus({
          invoiceReviewStatus: order.invoiceReviewStatus,
          supplierPaymentStatus: order.supplierPaymentStatus,
        }),
        paymentStatus: resolveSupplierPaymentStatusLabel(
          status === 'FULLY_PAID' ? 'PAID' : order.supplierPaymentStatus,
          monetaryBalance?.confirmedPaidKgs ?? paidKgs,
          approvedAmountKgs,
        ),
        returnReason: order.invoiceReturnReason ?? null,
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
    const payments = await this.transportExpenses.listPaymentLedgerHistory(id);
    const listItem = (await this.collectBills(user)).find(
      (item) => item.source === 'TRANSPORT_EXPENSE' && item.id === id,
    );
    const isChinaDomestic = detail.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT;
    const isKyrgyzstanDomestic = detail.expenseType === TransportExpenseType.LOCAL_DELIVERY;
    const audits = isChinaDomestic || isKyrgyzstanDomestic
      ? []
      : await this.prisma.auditLog.findMany({
          where: { entity: 'ProcurementTransportExpense', entityId: id },
          orderBy: { timestamp: 'desc' },
          take: 50,
        });
    const isCargo = detail.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT;
    const approvedAmountKgs = Number(
      detail.calculatedAmountKgs ?? detail.amountKgs ?? detail.amount ?? 0,
    );
    const cashierReturnedPaymentRequest = isCargo
      ? resolveCargoCashierReturnedPaymentRequest({
          status: detail.status,
          executionStatus: detail.executionStatus,
          returnReason: detail.returnReason,
          cashierInstructionAmountKgs: detail.cashierInstructionAmountKgs,
          returnedAt: detail.returnedAt,
        })
      : null;
    return {
      ...listItem,
      detail: {
        ...detail,
        cashierReturnedPaymentRequest,
        approvalStatus: isCargo ? resolveCargoApprovalStatus(detail.status) : undefined,
        paymentStatus: isCargo
          ? resolveCargoPaymentStatusLabel(
              detail.status,
              detail.paidAmountKgs,
              approvedAmountKgs,
            )
          : undefined,
        returnReason: detail.returnReason ?? null,
        payments,
        auditHistory: audits,
        cargo: isCargo
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

  /**
   * When the last mandatory procurement/import invoice is processed by HQ Accountant,
   * notify HQ Warehouse that the shipment is ready for receiving after costing.
   */
  private async notifyWarehouseWhenExpensesProcessed(
    tx: any,
    user: AuthUser,
    procurementOrderId: string,
    orderNumber: string,
  ) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: procurementOrderId, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        hqStockMovementCreatedAt: true,
        invoiceSentToAccountantAt: true,
        supplierInvoiceNumber: true,
        invoiceReviewStatus: true,
        supplierPaymentStatus: true,
        chinaDomesticTransportKgs: true,
        totalCargoCostKgs: true,
        localTransportKgs: true,
        svhToHqTransport: { select: { transportCostKgs: true } },
        transportExpenses: {
          select: {
            procurementOrderId: true,
            expenseType: true,
            amount: true,
            amountKgs: true,
            status: true,
          },
        },
      },
    });
    if (!order || order.hqStockMovementCreatedAt) return;

    const gate = validateHqReceivingInvoicePrerequisites({
      procurementOrderId: order.id,
      transportExpenses: order.transportExpenses,
      supplier: {
        invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
        supplierInvoiceNumber: order.supplierInvoiceNumber,
        invoiceReviewStatus: order.invoiceReviewStatus,
        supplierPaymentStatus: order.supplierPaymentStatus,
      },
      chinaSectionTotal: Number(order.chinaDomesticTransportKgs ?? 0),
      cargoSectionTotal: Number(order.totalCargoCostKgs ?? 0),
      kyrgyzstanSectionTotal: Number(
        order.localTransportKgs ?? order.svhToHqTransport?.transportCostKgs ?? 0,
      ),
    });
    if (!gate.canReceiveToHq) return;

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_RECEIVING_READY_AFTER_COSTING',
        entity: 'ProcurementOrder',
        entityId: order.id,
        metadata: {
          procurementOrderId: order.id,
          shipmentId: order.id,
          actorUserId: user.id,
          actorRole: user.role,
          accountantProcessingStatus: 'PROCESSED',
          oldCostingStatus: 'NOT_READY',
          newCostingStatus: 'READY_TO_CALCULATE',
          warehouseReceivingStatus: 'READY',
          timestamp: new Date().toISOString(),
        },
      },
    });

    await this.notifications.notifyInTx(tx, user, {
      type: AlertType.PROCUREMENT_STATUS_CHANGED,
      entityType: 'ProcurementOrder',
      entityId: order.id,
      referenceNumber: orderNumber || order.orderNumber,
      message:
        'Все обязательные расходы обработаны. Себестоимость рассчитана. Партия готова к приёмке.',
      recipientRoles: [Role.WAREHOUSE_MANAGER, Role.SUPPLY_CHAIN_MANAGER],
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
