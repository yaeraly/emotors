import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FileAttachmentEntityType,
  Prisma,
  ProcurementPaymentInfoMethod,
  ProcurementSupplierPaymentMethod,
  ProcurementSupplierPaymentStatus,
  Role,
  TransportExpenseStatus,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { canConfirmSupplierPayment } from '../rbac/rbac';
import { assertHqCashierAssignedAccount } from '../finance/finance-assignment.util';
import {
  assertCashierCannotMutateApprovedAmount,
  assertCashierCannotMutateFx,
  buildCashierBillsSummaryWithPaidAt,
  CashierBillListItem,
  CashierBillRequestType,
  CashierBillSource,
  CashierExecutionStatus,
  mapTransportExpenseTypeToCashierRequestType,
  matchesCashierBillSearch,
  normalizeCashierExecutionStatus,
  paginateItems,
} from './cashier-bills.util';
import { SupplierPaymentWorkflowService } from './supplier-payment-workflow.service';
import { TransportExpenseService } from './transport-expense.service';

export type CashierBillsQuery = {
  requestType?: string;
  accountantId?: string;
  senderId?: string;
  departmentOrBranch?: string;
  currency?: string;
  debitAccountId?: string;
  executionStatus?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

type TxClient = Prisma.TransactionClient;

@Injectable()
export class CashierBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly supplierPayments: SupplierPaymentWorkflowService,
    private readonly transportExpenses: TransportExpenseService,
  ) {}

  async list(user: AuthUser, query: CashierBillsQuery = {}) {
    this.assertCashier(user);
    const { items, paidAtById } = await this.collectBills();
    const filtered = this.applyFilters(items, query);
    const page = paginateItems(filtered, query.page ?? 1, query.pageSize ?? 20);
    return {
      ...page,
      summary: buildCashierBillsSummaryWithPaidAt(filtered, paidAtById),
    };
  }

  async summary(user: AuthUser, query: CashierBillsQuery = {}) {
    this.assertCashier(user);
    const { items, paidAtById } = await this.collectBills();
    return buildCashierBillsSummaryWithPaidAt(this.applyFilters(items, query), paidAtById);
  }

  async getOne(user: AuthUser, source: CashierBillSource, id: string) {
    this.assertCashier(user);
    if (source === 'SUPPLIER_PAYMENT') {
      return this.getSupplierDetail(user, id);
    }
    if (source === 'TRANSPORT_EXPENSE') {
      return this.getTransportDetail(user, id);
    }
    throw new BadRequestException('Unknown cashier bill source');
  }

  async start(
    user: AuthUser,
    source: CashierBillSource,
    id: string,
    dto: {
      paymentMethod?: string;
      financeAccountId?: string;
      cashierComment?: string;
    } = {},
  ) {
    this.assertCashier(user);
    if (source === 'SUPPLIER_PAYMENT') {
      return this.startSupplierPayment(user, id, dto);
    }
    return this.startTransportExpense(user, id, dto);
  }

  async confirm(
    user: AuthUser,
    source: CashierBillSource,
    id: string,
    dto: {
      paymentDate?: string;
      cashierComment?: string;
      expectedVersion?: number;
      actualPaidKgs?: number;
      currency?: string;
      exchangeRate?: number;
      financeAccountId?: string;
      paidAmountKgs?: number;
    },
  ) {
    this.assertCashier(user);
    if (source === 'SUPPLIER_PAYMENT') {
      return this.confirmSupplierPayment(user, id, dto);
    }
    return this.confirmTransportExpense(user, id, dto);
  }

  async returnToAccountant(
    user: AuthUser,
    source: CashierBillSource,
    id: string,
    reason: string,
  ) {
    this.assertCashier(user);
    const trimmed = String(reason || '').trim();
    if (trimmed.length < 3) {
      throw new BadRequestException('Return reason is required');
    }
    if (source === 'SUPPLIER_PAYMENT') {
      const payment = await this.prisma.procurementSupplierPayment.findUnique({
        where: { id },
        select: { procurementOrderId: true },
      });
      if (!payment) throw new NotFoundException('Payment task not found');
      const result = await this.supplierPayments.returnPaymentToAccountant(
        user,
        payment.procurementOrderId,
        id,
        { reason: trimmed },
      );
      return { id, source, executionStatus: 'RETURNED_TO_ACCOUNTANT' as const, result };
    }
    const result = await this.transportExpenses.returnToCreator(user, id, { reason: trimmed });
    return { id, source, executionStatus: 'RETURNED_TO_ACCOUNTANT' as const, result };
  }

  async reportFailure(
    user: AuthUser,
    source: CashierBillSource,
    id: string,
    dto: { reason: string },
  ) {
    this.assertCashier(user);
    const reason = String(dto.reason || '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Failure reason is required');
    }
    if (source === 'SUPPLIER_PAYMENT') {
      return this.failSupplierPayment(user, id, reason);
    }
    return this.failTransportExpense(user, id, reason);
  }

  private assertCashier(user: AuthUser) {
    if (!canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('Only HQ Cashier can access cashier payment tasks');
    }
  }

  private async collectBills(): Promise<{
    items: CashierBillListItem[];
    paidAtById: Record<string, string | null | undefined>;
  }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [supplierRows, transportRows] = await Promise.all([
      this.prisma.procurementSupplierPayment.findMany({
        where: {
          OR: [
            { status: ProcurementSupplierPaymentStatus.PENDING_CASHIER },
            {
              status: ProcurementSupplierPaymentStatus.ACTIVE,
              paidAt: { gte: startOfDay },
            },
            {
              status: ProcurementSupplierPaymentStatus.RETURNED,
              executionStatus: { in: ['FAILED', 'RETURNED_TO_ACCOUNTANT'] },
              returnedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          ],
        },
        include: {
          accountant: { select: { id: true, fullName: true } },
          cashier: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          intendedFinanceAccount: { select: { id: true, name: true, currency: true, typeCode: true } },
          supplier: { select: { id: true, name: true } },
          procurementOrder: {
            select: {
              id: true,
              orderNumber: true,
              totalYuan: true,
              totalPaidYuan: true,
              remainingYuan: true,
              createdBy: { select: { id: true, fullName: true, role: true } },
              invoiceSentBy: { select: { id: true, fullName: true, role: true } },
            },
          },
        },
        orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      }),
      this.prisma.procurementTransportExpense.findMany({
        where: {
          OR: [
            {
              status: {
                in: [TransportExpenseStatus.PENDING_CASHIER, TransportExpenseStatus.PARTIALLY_PAID],
              },
            },
            {
              status: TransportExpenseStatus.PAID,
              paidAt: { gte: startOfDay },
            },
            {
              status: TransportExpenseStatus.RETURNED,
              executionStatus: { in: ['FAILED', 'RETURNED_TO_ACCOUNTANT'] },
              returnedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          ],
        },
        include: {
          accountant: { select: { id: true, fullName: true } },
          cashier: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          financeAccount: { select: { id: true, name: true, currency: true, typeCode: true } },
          transportCompany: { select: { id: true, name: true } },
          procurementOrder: { select: { id: true, orderNumber: true } },
        },
        orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      }),
    ]);

    const paidAtById: Record<string, string | null | undefined> = {};
    const supplierItems: CashierBillListItem[] = supplierRows.map((row) => {
      const executionStatus = normalizeCashierExecutionStatus(row.executionStatus, row.status);
      paidAtById[row.id] = row.paidAt?.toISOString() ?? null;
      const sender =
        row.procurementOrder?.invoiceSentBy ||
        row.procurementOrder?.createdBy ||
        row.createdBy;
      return {
        id: row.id,
        source: 'SUPPLIER_PAYMENT',
        paymentNumber: `PAY-${row.sequenceNumber}`,
        requestNumber: row.procurementOrder?.orderNumber || row.id,
        requestType: 'SUPPLIER_PAYMENT',
        sentToCashierAt: row.sentToCashierAt?.toISOString() ?? null,
        sender: sender
          ? { id: sender.id, fullName: sender.fullName, role: 'role' in sender ? sender.role : null }
          : null,
        accountant: row.accountant,
        cashier: row.cashier,
        departmentOrBranch: null,
        recipientName: row.recipientName || row.supplier?.name || '—',
        basis: row.procurementOrder
          ? `PO ${row.procurementOrder.orderNumber} · ${row.supplier?.name || 'Supplier'}`
          : row.supplier?.name || 'Supplier payment',
        amount: Number(row.amountYuan),
        currency: 'CNY',
        exchangeRate: Number(row.exchangeRate),
        amountKgs: Number(row.approvedAmountKgs || row.amountKgs),
        debitAccountName: row.intendedFinanceAccount?.name ?? null,
        debitAccountId: row.intendedFinanceAccount?.id ?? null,
        executionStatus,
        relatedOrderNumber: row.procurementOrder?.orderNumber ?? null,
        relatedOrderId: row.procurementOrder?.id ?? null,
        href: `/finance/cashier-bills?source=SUPPLIER_PAYMENT&id=${row.id}`,
      };
    });

    const transportItems: CashierBillListItem[] = transportRows.map((row) => {
      const executionStatus = normalizeCashierExecutionStatus(row.executionStatus, row.status);
      paidAtById[row.id] = row.paidAt?.toISOString() ?? null;
      const requestType = mapTransportExpenseTypeToCashierRequestType(row.expenseType);
      const remainingKgs = Math.max(0, Number(row.amountKgs) - Number(row.paidAmountKgs || 0));
      const amountKgs =
        row.status === TransportExpenseStatus.PARTIALLY_PAID ||
        row.status === TransportExpenseStatus.PENDING_CASHIER
          ? remainingKgs > 0
            ? remainingKgs
            : Number(row.amountKgs)
          : Number(row.amountKgs);
      return {
        id: row.id,
        source: 'TRANSPORT_EXPENSE',
        paymentNumber: row.expenseNumber,
        requestNumber: row.expenseNumber,
        requestType,
        sentToCashierAt: row.sentToCashierAt?.toISOString() ?? null,
        sender: row.createdBy
          ? { id: row.createdBy.id, fullName: row.createdBy.fullName, role: row.createdBy.role }
          : null,
        accountant: row.accountant,
        cashier: row.cashier,
        departmentOrBranch: null,
        recipientName: row.recipientName || row.transportCompany?.name || row.supplierCarrier || '—',
        basis: row.procurementOrder
          ? `PO ${row.procurementOrder.orderNumber} · ${row.expenseName || row.expenseType}`
          : row.expenseName || row.expenseType,
        amount: Number(row.amount),
        currency: row.currency || 'KGS',
        exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
        amountKgs,
        debitAccountName: row.financeAccount?.name ?? null,
        debitAccountId: row.financeAccount?.id ?? null,
        executionStatus,
        relatedOrderNumber: row.procurementOrder?.orderNumber ?? null,
        relatedOrderId: row.procurementOrder?.id ?? null,
        href: `/finance/cashier-bills?source=TRANSPORT_EXPENSE&id=${row.id}`,
      };
    });

    const items = [...supplierItems, ...transportItems].sort((a, b) => {
      const aTime = a.sentToCashierAt ? new Date(a.sentToCashierAt).getTime() : 0;
      const bTime = b.sentToCashierAt ? new Date(b.sentToCashierAt).getTime() : 0;
      return aTime - bTime;
    });

    return { items, paidAtById };
  }

  private applyFilters(items: CashierBillListItem[], query: CashierBillsQuery) {
    return items.filter((item) => {
      if (query.requestType && item.requestType !== query.requestType) return false;
      if (query.accountantId && item.accountant?.id !== query.accountantId) return false;
      if (query.senderId && item.sender?.id !== query.senderId) return false;
      if (
        query.departmentOrBranch &&
        !(item.departmentOrBranch || '')
          .toLowerCase()
          .includes(query.departmentOrBranch.trim().toLowerCase())
      ) {
        return false;
      }
      if (query.currency && item.currency.toUpperCase() !== query.currency.toUpperCase()) {
        return false;
      }
      if (query.debitAccountId && item.debitAccountId !== query.debitAccountId) return false;
      if (
        query.executionStatus &&
        item.executionStatus !== String(query.executionStatus).toUpperCase()
      ) {
        return false;
      }
      if (query.dateFrom) {
        const from = new Date(query.dateFrom);
        if (!item.sentToCashierAt || new Date(item.sentToCashierAt) < from) return false;
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        if (!item.sentToCashierAt || new Date(item.sentToCashierAt) > to) return false;
      }
      if (query.search && !matchesCashierBillSearch(item, query.search)) return false;
      return true;
    });
  }

  private async getSupplierDetail(user: AuthUser, id: string) {
    const payment = await this.prisma.procurementSupplierPayment.findUnique({
      where: { id },
      include: {
        accountant: { select: { id: true, fullName: true, role: true } },
        cashier: { select: { id: true, fullName: true, role: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
        intendedFinanceAccount: {
          select: {
            id: true,
            name: true,
            currency: true,
            typeCode: true,
            availableBalance: true,
            currentBalance: true,
            scope: true,
          },
        },
        actualFinanceAccount: {
          select: { id: true, name: true, currency: true, typeCode: true },
        },
        supplier: { select: { id: true, name: true } },
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        paymentInfoVersion: true,
        procurementOrder: {
          include: {
            supplier: { select: { id: true, name: true } },
            createdBy: { select: { id: true, fullName: true, role: true } },
            invoiceSentBy: { select: { id: true, fullName: true, role: true } },
            supplierPayments: {
              orderBy: { sequenceNumber: 'asc' },
              include: {
                cashier: { select: { id: true, fullName: true } },
                accountant: { select: { id: true, fullName: true } },
                attachments: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment task not found');
    if (
      payment.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER &&
      payment.status !== ProcurementSupplierPaymentStatus.ACTIVE &&
      payment.status !== ProcurementSupplierPaymentStatus.RETURNED
    ) {
      throw new ForbiddenException('This payment is not available in the cashier queue');
    }

    await this.auditOpen(user, 'SUPPLIER_PAYMENT', id, payment.procurementOrderId);

    const paymentInfoId = payment.paymentInfoVersionId;
    const qrFromInfo = paymentInfoId
      ? await this.prisma.fileAttachment.findMany({
          where: {
            deletedAt: null,
            entityType: FileAttachmentEntityType.PAYMENT_QR,
            entityId: paymentInfoId,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const qrAttachments = [
      ...qrFromInfo,
      ...payment.attachments.filter(
        (a) =>
          a.entityType === FileAttachmentEntityType.PAYMENT_QR ||
          String(a.fileName || '').toLowerCase().includes('qr'),
      ),
    ];
    const receiptAttachments = payment.attachments.filter(
      (a) => a.entityType === FileAttachmentEntityType.SUPPLIER_PAYMENT,
    );
    const supportingAttachments = payment.attachments.filter(
      (a) =>
        a.entityType !== FileAttachmentEntityType.SUPPLIER_PAYMENT &&
        a.entityType !== FileAttachmentEntityType.PAYMENT_QR,
    );

    const order = payment.procurementOrder;
    const paidYuan = (order?.supplierPayments || [])
      .filter((p) => p.status === ProcurementSupplierPaymentStatus.ACTIVE)
      .reduce((sum, p) => sum + Number(p.amountYuan), 0);

    const audits = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: payment.procurementOrderId, entity: 'ProcurementOrder' },
          { entityId: payment.id },
          { entityId: payment.procurementOrderId, entity: 'ProcurementCashierPayment' },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return {
      id: payment.id,
      source: 'SUPPLIER_PAYMENT' as const,
      paymentNumber: `PAY-${payment.sequenceNumber}`,
      requestNumber: order?.orderNumber || payment.id,
      requestType: 'SUPPLIER_PAYMENT' as CashierBillRequestType,
      executionStatus: normalizeCashierExecutionStatus(payment.executionStatus, payment.status),
      sentToCashierAt: payment.sentToCashierAt?.toISOString() ?? null,
      executionStartedAt: payment.executionStartedAt?.toISOString() ?? null,
      executedAt: payment.paidAt?.toISOString() ?? null,
      returnReason: payment.returnReason,
      failureReason: payment.failureReason,
      cashierComment: payment.cashierComment,
      accountantComment: payment.accountantComment,
      paymentInstructions: payment.paymentInstructions,
      sender: order?.invoiceSentBy || order?.createdBy || payment.createdBy,
      accountant: payment.accountant,
      cashier: payment.cashier,
      recipient: {
        name: payment.recipientName,
        company: payment.recipientCompany,
        bankName: payment.bankName,
        beneficiaryName: payment.beneficiaryName,
        accountNumber: payment.accountNumber,
        swiftCode: payment.swiftCode,
        cardholderName: payment.cardholderName,
        cardNumberMasked: payment.cardNumberMasked,
      },
      paymentMethod: payment.paymentMethod,
      amount: Number(payment.amountYuan),
      currency: 'CNY',
      exchangeRate: Number(payment.exchangeRate),
      amountKgs: Number(payment.approvedAmountKgs || payment.amountKgs),
      approvedAmountKgs: Number(payment.approvedAmountKgs),
      calculatedAmountKgs: Number(payment.calculatedAmountKgs),
      actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
      debitAccount: payment.intendedFinanceAccount,
      actualDebitAccount: payment.actualFinanceAccount,
      version: payment.version,
      supplier: payment.supplier,
      procurement: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            totalYuan: Number(order.totalYuan),
            totalPaidYuan: paidYuan,
            remainingYuan: Math.max(0, Number(order.totalYuan) - paidYuan),
            // Cost base stays full approved procurement amount.
            costBaseYuan: Number(order.totalYuan),
            supplierPaymentStatus: order.supplierPaymentStatus,
          }
        : null,
      previousPayments: (order?.supplierPayments || []).map((p) => ({
        id: p.id,
        paymentNumber: `PAY-${p.sequenceNumber}`,
        amountYuan: Number(p.amountYuan),
        exchangeRate: Number(p.exchangeRate),
        amountKgs: Number(p.approvedAmountKgs || p.amountKgs),
        status: p.status,
        executionStatus: normalizeCashierExecutionStatus(p.executionStatus, p.status),
        paidAt: p.paidAt?.toISOString() ?? null,
        cashier: p.cashier,
        accountant: p.accountant,
        receiptCount: p.attachments.filter(
          (a) => a.entityType === FileAttachmentEntityType.SUPPLIER_PAYMENT,
        ).length,
      })),
      qrAttachments,
      receiptAttachments,
      supportingAttachments,
      auditHistory: audits,
      relatedOrderId: order?.id ?? null,
      href: order ? `/procurement/orders/${order.id}` : null,
    };
  }

  private async getTransportDetail(user: AuthUser, id: string) {
    const expense = await this.prisma.procurementTransportExpense.findUnique({
      where: { id },
      include: {
        accountant: { select: { id: true, fullName: true, role: true } },
        cashier: { select: { id: true, fullName: true, role: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
        financeAccount: {
          select: {
            id: true,
            name: true,
            currency: true,
            typeCode: true,
            availableBalance: true,
            currentBalance: true,
            scope: true,
          },
        },
        transportCompany: true,
        procurementOrder: { select: { id: true, orderNumber: true, totalYuan: true } },
      },
    });
    if (!expense) throw new NotFoundException('Transport payment task not found');

    await this.auditOpen(user, 'TRANSPORT_EXPENSE', id, expense.procurementOrderId);

    const attachments = await this.prisma.fileAttachment.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityId: id },
          { entityType: FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT, entityId: id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const qrAttachments = attachments.filter(
      (a) =>
        a.entityType === FileAttachmentEntityType.PAYMENT_QR ||
        String(a.fileName || '').toLowerCase().includes('qr'),
    );
    const receiptAttachments = attachments.filter(
      (a) => a.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
    );
    const cargoReceipts = attachments.filter(
      (a) =>
        a.entityType === FileAttachmentEntityType.CARGO_RECEIPT ||
        a.id === expense.cargoReceiptAttachmentId,
    );
    const supportingAttachments = attachments.filter(
      (a) =>
        a.entityType !== FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT &&
        a.entityType !== FileAttachmentEntityType.PAYMENT_QR,
    );

    const requestedKgs = Number(expense.amountKgs) > 0 ? Number(expense.amountKgs) : Number(expense.amount);
    const paidAmountKgs = Number(expense.paidAmountKgs || 0);
    const remainingKgs = Math.max(0, requestedKgs - paidAmountKgs);

    const audits = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: id },
          ...(expense.procurementOrderId ? [{ entityId: expense.procurementOrderId }] : []),
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return {
      id: expense.id,
      source: 'TRANSPORT_EXPENSE' as const,
      paymentNumber: expense.expenseNumber,
      requestNumber: expense.expenseNumber,
      requestType: mapTransportExpenseTypeToCashierRequestType(expense.expenseType),
      executionStatus: normalizeCashierExecutionStatus(expense.executionStatus, expense.status),
      sentToCashierAt: expense.sentToCashierAt?.toISOString() ?? null,
      executionStartedAt: expense.executionStartedAt?.toISOString() ?? null,
      executedAt: expense.paidAt?.toISOString() ?? null,
      returnReason: expense.returnReason,
      failureReason: expense.failureReason,
      cashierComment: expense.cashierComment,
      accountantComment: expense.accountantComment,
      sender: expense.createdBy,
      accountant: expense.accountant,
      cashier: expense.cashier,
      recipient: {
        name: expense.recipientName || expense.transportCompany?.name || expense.supplierCarrier,
        company: expense.transportCompany?.name || expense.supplierCarrier,
        bankName: expense.bankName || expense.transportCompany?.bankName,
        beneficiaryName: expense.accountHolder || expense.transportCompany?.accountHolder,
        accountNumber: expense.accountNumber || expense.transportCompany?.bankAccount,
        swiftCode: expense.swiftCode,
      },
      paymentMethod: expense.paymentMethod,
      amount: Number(expense.amount),
      currency: expense.currency,
      expenseName: expense.expenseName || expense.comment || null,
      submittedAt: expense.submittedAt?.toISOString() ?? null,
      updatedAt: expense.updatedAt?.toISOString() ?? null,
      exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
      amountKgs: requestedKgs,
      paidAmountKgs,
      remainingAmountKgs: remainingKgs,
      // Cost base remains full approved/calculated request amount.
      costBaseKgs:
        expense.calculatedAmountKgs != null ? Number(expense.calculatedAmountKgs) : requestedKgs,
      debitAccount: expense.financeAccount,
      cargo: {
        transportCompany: expense.transportCompany?.name || expense.supplierCarrier,
        totalWeightKg: expense.totalWeightKg != null ? Number(expense.totalWeightKg) : null,
        cargoRateUsdPerKg:
          expense.cargoRateUsdPerKg != null ? Number(expense.cargoRateUsdPerKg) : null,
        usdExchangeRate: expense.usdExchangeRate != null ? Number(expense.usdExchangeRate) : null,
        calculatedAmountUsd:
          expense.calculatedAmountUsd != null ? Number(expense.calculatedAmountUsd) : null,
        calculatedAmountKgs:
          expense.calculatedAmountKgs != null ? Number(expense.calculatedAmountKgs) : null,
      },
      qrAttachments,
      receiptAttachments,
      cargoReceipts,
      supportingAttachments,
      auditHistory: audits,
      relatedOrderId: expense.procurementOrderId,
      relatedOrderNumber: expense.procurementOrder?.orderNumber ?? null,
      href: expense.procurementOrderId
        ? `/procurement/orders/${expense.procurementOrderId}`
        : null,
    };
  }

  private async startSupplierPayment(
    user: AuthUser,
    id: string,
    dto: {
      paymentMethod?: string;
      financeAccountId?: string;
      cashierComment?: string;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcurementSupplierPayment" WHERE id = ${id} FOR UPDATE`;
      const payment = await tx.procurementSupplierPayment.findUnique({
        where: { id },
        include: {
          procurementOrder: { select: { id: true, orderNumber: true } },
          cashier: { select: { id: true, fullName: true } },
          intendedFinanceAccount: { select: { id: true, name: true } },
          supplier: { select: { name: true } },
        },
      });
      if (!payment) throw new NotFoundException('Payment task not found');
      if (payment.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER) {
        throw new BadRequestException('Payment is not awaiting cashier execution');
      }
      const current = normalizeCashierExecutionStatus(payment.executionStatus, payment.status);
      if (current === 'COMPLETED') {
        throw new ConflictException('Payment is already completed');
      }
      if (current === 'IN_PROGRESS' && payment.cashierId && payment.cashierId !== user.id) {
        throw new ConflictException(
          `Payment is already being processed by ${payment.cashier?.fullName || 'another cashier'}`,
        );
      }
      if (current === 'RETURNED_TO_ACCOUNTANT' || current === 'CANCELLED') {
        throw new BadRequestException('Payment is not available for execution');
      }
      if (dto.financeAccountId) {
        await assertHqCashierAssignedAccount(this.prisma, user, dto.financeAccountId);
      }

      const nextPaymentMethod =
        dto.paymentMethod &&
        (Object.values(ProcurementSupplierPaymentMethod) as string[]).includes(dto.paymentMethod)
          ? (dto.paymentMethod as ProcurementSupplierPaymentMethod)
          : undefined;

      const updated = await tx.procurementSupplierPayment.update({
        where: { id },
        data: {
          executionStatus: 'IN_PROGRESS',
          executionStartedAt: payment.executionStartedAt ?? new Date(),
          cashierId: user.id,
          failureReason: null,
          version: { increment: 1 },
          ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
          ...(dto.financeAccountId ? { intendedFinanceAccountId: dto.financeAccountId } : {}),
          ...(dto.cashierComment !== undefined
            ? { cashierComment: dto.cashierComment.trim() || null }
            : {}),
        },
      });

      if (current !== 'IN_PROGRESS') {
        await this.writeAudit(tx, user, 'CASHIER_PAYMENT_STARTED', payment.procurementOrderId, {
          paymentId: id,
          oldExecutionStatus: current,
        }, {
          paymentId: id,
          executionStatus: 'IN_PROGRESS',
          cashierId: user.id,
        });

        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.CASHIER_PAYMENT_STARTED,
          entityType: 'ProcurementSupplierPayment',
          entityId: id,
          referenceNumber: payment.procurementOrder?.orderNumber || id,
          message: `Cashier started payment PAY-${payment.sequenceNumber} for ${payment.procurementOrder?.orderNumber || id} (${Number(payment.approvedAmountKgs).toFixed(2)} KGS).`,
          recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
        });
      }

      return {
        id: updated.id,
        source: 'SUPPLIER_PAYMENT' as const,
        executionStatus: 'IN_PROGRESS' as CashierExecutionStatus,
        cashierId: user.id,
        executionStartedAt: updated.executionStartedAt?.toISOString() ?? null,
      };
    });
  }

  private async startTransportExpense(
    user: AuthUser,
    id: string,
    dto: {
      paymentMethod?: string;
      financeAccountId?: string;
      cashierComment?: string;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcurementTransportExpense" WHERE id = ${id} FOR UPDATE`;
      const expense = await tx.procurementTransportExpense.findUnique({
        where: { id },
        include: { cashier: { select: { id: true, fullName: true } } },
      });
      if (!expense) throw new NotFoundException('Transport payment task not found');
      if (
        expense.status !== TransportExpenseStatus.PENDING_CASHIER &&
        expense.status !== TransportExpenseStatus.PARTIALLY_PAID
      ) {
        throw new BadRequestException('Expense is not awaiting cashier execution');
      }
      // Only enforce assignment when the cashier explicitly selects a debit account.
      // Accountant-intended accounts must not block opening/starting the HQ Cashier queue item.
      if (dto.financeAccountId) {
        await assertHqCashierAssignedAccount(this.prisma, user, dto.financeAccountId);
      }
      const current = normalizeCashierExecutionStatus(expense.executionStatus, expense.status);
      if (current === 'COMPLETED') {
        throw new ConflictException('Payment is already completed');
      }
      if (current === 'IN_PROGRESS' && expense.cashierId && expense.cashierId !== user.id) {
        throw new ConflictException(
          `Payment is already being processed by ${expense.cashier?.fullName || 'another cashier'}`,
        );
      }

      const nextPaymentMethod =
        dto.paymentMethod === 'BANK_ACCOUNT' || dto.paymentMethod === 'QR_CODE'
          ? (dto.paymentMethod as ProcurementPaymentInfoMethod)
          : undefined;

      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          executionStatus: 'IN_PROGRESS',
          executionStartedAt: expense.executionStartedAt ?? new Date(),
          cashierId: user.id,
          failureReason: null,
          ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
          ...(dto.financeAccountId ? { financeAccountId: dto.financeAccountId } : {}),
          ...(dto.cashierComment !== undefined
            ? { cashierComment: dto.cashierComment.trim() || null }
            : {}),
        },
      });

      if (current !== 'IN_PROGRESS') {
        await this.writeAudit(tx, user, 'CASHIER_PAYMENT_STARTED', id, {
          oldExecutionStatus: current,
        }, {
          executionStatus: 'IN_PROGRESS',
          cashierId: user.id,
        });

        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.CASHIER_PAYMENT_STARTED,
          entityType: 'ProcurementTransportExpense',
          entityId: id,
          referenceNumber: expense.expenseNumber,
          message: `Cashier started transport payment ${expense.expenseNumber}.`,
          recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
        });
      }

      return {
        id: updated.id,
        source: 'TRANSPORT_EXPENSE' as const,
        executionStatus: 'IN_PROGRESS' as CashierExecutionStatus,
        cashierId: user.id,
        executionStartedAt: updated.executionStartedAt?.toISOString() ?? null,
      };
    });
  }

  private async confirmSupplierPayment(
    user: AuthUser,
    id: string,
    dto: {
      paymentDate?: string;
      cashierComment?: string;
      expectedVersion?: number;
      actualPaidKgs?: number;
      currency?: string;
      exchangeRate?: number;
      financeAccountId?: string;
      paymentMethod?: string;
      accountChangeReason?: string;
      actualPaidDifferenceReason?: string;
    },
  ) {
    const payment = await this.prisma.procurementSupplierPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment task not found');
    if (!dto.paymentDate) {
      throw new BadRequestException('Actual payment date is required');
    }

    let actualPaidKgs: number;
    try {
      actualPaidKgs = assertCashierCannotMutateApprovedAmount({
        approvedAmountKgs: Number(payment.approvedAmountKgs),
        requestedActualPaidKgs: dto.actualPaidKgs,
      });
      assertCashierCannotMutateFx({
        storedCurrency: 'CNY',
        storedExchangeRate: Number(payment.exchangeRate),
        requestedCurrency: dto.currency,
        requestedExchangeRate: dto.exchangeRate,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid payment mutation');
    }

    const financeAccountId = dto.financeAccountId || payment.intendedFinanceAccountId || undefined;
    if (!financeAccountId) {
      throw new BadRequestException('Debit account is required');
    }

    const nextPaymentMethod =
      dto.paymentMethod &&
      (Object.values(ProcurementSupplierPaymentMethod) as string[]).includes(dto.paymentMethod)
        ? (dto.paymentMethod as ProcurementSupplierPaymentMethod)
        : undefined;

    if (nextPaymentMethod || (financeAccountId && financeAccountId !== payment.intendedFinanceAccountId)) {
      await this.prisma.procurementSupplierPayment.update({
        where: { id },
        data: {
          ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
          intendedFinanceAccountId: financeAccountId,
        },
      });
    }

    const result = await this.supplierPayments.confirmPayment(
      user,
      payment.procurementOrderId,
      id,
      {
        actualPaidKgs,
        paymentDate: dto.paymentDate,
        cashierComment: dto.cashierComment,
        expectedVersion: dto.expectedVersion,
        financeAccountId,
        accountChangeReason:
          financeAccountId !== payment.intendedFinanceAccountId
            ? dto.accountChangeReason?.trim() || 'Selected by cashier during confirmation'
            : dto.accountChangeReason,
        actualPaidDifferenceReason: dto.actualPaidDifferenceReason,
      },
    );

    await this.prisma.procurementSupplierPayment.update({
      where: { id },
      data: { executionStatus: 'COMPLETED' },
    });

    return {
      id,
      source: 'SUPPLIER_PAYMENT' as const,
      executionStatus: 'COMPLETED' as const,
      result,
    };
  }

  private async confirmTransportExpense(
    user: AuthUser,
    id: string,
    dto: {
      paymentDate?: string;
      cashierComment?: string;
      financeAccountId?: string;
      paidAmountKgs?: number;
      currency?: string;
      exchangeRate?: number;
      paymentMethod?: string;
    },
  ) {
    const expense = await this.prisma.procurementTransportExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Transport payment task not found');
    if (!dto.paymentDate) {
      throw new BadRequestException('Actual payment date is required');
    }

    const financeAccountId = dto.financeAccountId || expense.financeAccountId || undefined;
    if (!financeAccountId) {
      throw new BadRequestException('Debit account is required');
    }

    try {
      assertCashierCannotMutateFx({
        storedCurrency: expense.currency,
        storedExchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
        requestedCurrency: dto.currency,
        requestedExchangeRate: dto.exchangeRate,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid payment mutation');
    }

    const requestedKgs = Number(expense.amountKgs) > 0 ? Number(expense.amountKgs) : Number(expense.amount);
    const alreadyPaid = Number(expense.paidAmountKgs || 0);
    const remaining = Math.max(0, requestedKgs - alreadyPaid);
    const paidAmountKgs =
      dto.paidAmountKgs != null ? Math.round(Number(dto.paidAmountKgs) * 100) / 100 : remaining;
    if (!(paidAmountKgs > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (paidAmountKgs > remaining + 0.009) {
      throw new BadRequestException('Cashier cannot change the approved payment amount');
    }

    const nextPaymentMethod =
      dto.paymentMethod === 'BANK_ACCOUNT' || dto.paymentMethod === 'QR_CODE'
        ? (dto.paymentMethod as ProcurementPaymentInfoMethod)
        : undefined;

    if (nextPaymentMethod || financeAccountId !== expense.financeAccountId) {
      await this.prisma.procurementTransportExpense.update({
        where: { id },
        data: {
          ...(nextPaymentMethod ? { paymentMethod: nextPaymentMethod } : {}),
          financeAccountId,
        },
      });
    }

    const result = await this.transportExpenses.confirmPayment(user, id, {
      financeAccountId,
      paidAmountKgs,
      paidAt: dto.paymentDate,
      cashierComment: dto.cashierComment,
    });

    const refreshed = await this.prisma.procurementTransportExpense.findUnique({ where: { id } });
    const executionStatus =
      refreshed?.status === TransportExpenseStatus.PAID ? 'COMPLETED' : 'PENDING_EXECUTION';
    await this.prisma.procurementTransportExpense.update({
      where: { id },
      data: { executionStatus },
    });

    return {
      id,
      source: 'TRANSPORT_EXPENSE' as const,
      executionStatus,
      result,
    };
  }

  private async failSupplierPayment(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcurementSupplierPayment" WHERE id = ${id} FOR UPDATE`;
      const payment = await tx.procurementSupplierPayment.findUnique({
        where: { id },
        include: { procurementOrder: { select: { orderNumber: true } } },
      });
      if (!payment) throw new NotFoundException('Payment task not found');
      if (payment.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER) {
        throw new BadRequestException('Only pending cashier payments can be marked failed');
      }
      const current = normalizeCashierExecutionStatus(payment.executionStatus, payment.status);
      if (current === 'COMPLETED') {
        throw new ConflictException('Payment is already completed');
      }

      const updated = await tx.procurementSupplierPayment.update({
        where: { id },
        data: {
          executionStatus: 'FAILED',
          failureReason: reason,
          cashierId: user.id,
          // Keep PENDING_CASHIER so balances stay untouched; accountant can recall/edit via return.
          version: { increment: 1 },
        },
      });

      await this.writeAudit(tx, user, 'CASHIER_PAYMENT_FAILED', payment.procurementOrderId, {
        executionStatus: current,
      }, {
        paymentId: id,
        executionStatus: 'FAILED',
        failureReason: reason,
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.CASHIER_PAYMENT_FAILED,
        entityType: 'ProcurementSupplierPayment',
        entityId: id,
        referenceNumber: payment.procurementOrder?.orderNumber || id,
        message: `Cashier reported payment failure for PAY-${payment.sequenceNumber}: ${reason}`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });

      return {
        id: updated.id,
        source: 'SUPPLIER_PAYMENT' as const,
        executionStatus: 'FAILED' as const,
        failureReason: reason,
      };
    });
  }

  private async failTransportExpense(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProcurementTransportExpense" WHERE id = ${id} FOR UPDATE`;
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport payment task not found');
      if (
        expense.status !== TransportExpenseStatus.PENDING_CASHIER &&
        expense.status !== TransportExpenseStatus.PARTIALLY_PAID
      ) {
        throw new BadRequestException('Expense is not awaiting cashier execution');
      }

      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          executionStatus: 'FAILED',
          failureReason: reason,
          cashierId: user.id,
        },
      });

      await this.writeAudit(tx, user, 'CASHIER_PAYMENT_FAILED', id, {
        executionStatus: expense.executionStatus,
      }, {
        executionStatus: 'FAILED',
        failureReason: reason,
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.CASHIER_PAYMENT_FAILED,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: `Cashier reported payment failure for ${expense.expenseNumber}: ${reason}`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });

      return {
        id: updated.id,
        source: 'TRANSPORT_EXPENSE' as const,
        executionStatus: 'FAILED' as const,
        failureReason: reason,
      };
    });
  }

  private async auditOpen(
    user: AuthUser,
    source: CashierBillSource,
    id: string,
    orderId?: string | null,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'CASHIER_PAYMENT_OPENED',
        entity:
          source === 'SUPPLIER_PAYMENT'
            ? 'ProcurementSupplierPayment'
            : 'ProcurementTransportExpense',
        entityId: orderId || id,
        metadata: {
          source,
          paymentId: id,
          cashierId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  private async writeAudit(
    tx: TxClient,
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
        entity: 'ProcurementCashierPayment',
        entityId,
        metadata: {
          actorId: user.id,
          actorName: user.fullName ?? user.email ?? user.id,
          timestamp: new Date().toISOString(),
          oldValue: oldValue as Prisma.InputJsonValue,
          newValue: newValue as Prisma.InputJsonValue,
        },
      },
    });
  }
}
