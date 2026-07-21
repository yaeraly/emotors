import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FileAttachmentEntityType,
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  Prisma,
  ProcurementPaymentInfoMethod,
  Role,
  TransportExpenseStatus,
  TransportExpenseType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from '../finance/finance-number.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canCreateProcurementOrder,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  ApproveTransportExpenseDto,
  ConfirmTransportExpenseDto,
  CreateTransportExpenseDto,
  ReturnTransportExpenseDto,
  UpdateTransportExpenseDto,
} from './dto/transport-expense.dto';
import { estimateSectionExpenseCostKgs } from './procurement-cost.util';
import {
  hasActiveSectionRequest,
  requestTypeForExpenseType,
  summarizeSectionPayments,
  validateSectionPayableSubmit,
} from './section-payable.util';
import { LandedCostService } from './landed-cost.service';

type Tx = Prisma.TransactionClient;

const EDITABLE = new Set<string>([
  TransportExpenseStatus.DRAFT,
  TransportExpenseStatus.RETURNED,
]);

const INCLUDE = {
  createdBy: { select: { id: true, fullName: true, role: true } },
  accountant: { select: { id: true, fullName: true, role: true } },
  cashier: { select: { id: true, fullName: true, role: true } },
  returnedBy: { select: { id: true, fullName: true, role: true } },
  financeAccount: {
    select: { id: true, name: true, accountNumber: true, availableBalance: true, currency: true },
  },
  transportCompany: { select: { id: true, name: true, companyCode: true } },
  procurementOrder: { select: { id: true, orderNumber: true } },
} as const;

@Injectable()
export class TransportExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly notifications: NotificationsService,
    private readonly landedCostService: LandedCostService,
  ) {}

  list(user: AuthUser, orderId?: string) {
    this.assertCanView(user);
    return this.prisma.procurementTransportExpense
      .findMany({
        where: {
          ...(orderId ? { procurementOrderId: orderId } : {}),
        },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      .then((rows) => Promise.all(rows.map((row) => this.toResponse(row))));
  }

  listAccountantQueue(user: AuthUser) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.procurementTransportExpense
      .findMany({
        where: { status: TransportExpenseStatus.WAITING_ACCOUNTANT },
        include: INCLUDE,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      })
      .then((rows) => Promise.all(rows.map((row) => this.toResponse(row))));
  }

  listCashierQueue(user: AuthUser) {
    if (!canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.procurementTransportExpense
      .findMany({
        where: { status: TransportExpenseStatus.PENDING_CASHIER },
        include: INCLUDE,
        orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      })
      .then((rows) => Promise.all(rows.map((row) => this.toResponse(row))));
  }

  getOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    return this.prisma.procurementTransportExpense
      .findUnique({ where: { id }, include: INCLUDE })
      .then(async (row) => {
        if (!row) throw new NotFoundException('Transport expense not found');
        return this.toResponse(row);
      });
  }

  create(user: AuthUser, dto: CreateTransportExpenseDto) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only Supply Manager can create transport expenses');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.procurementOrderId) {
        const order = await tx.procurementOrder.findFirst({
          where: { id: dto.procurementOrderId, deletedAt: null },
        });
        if (!order) throw new NotFoundException('Procurement order not found');
      }
      const amount = roundMoney(dto.amount);
      if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
      const currency = (dto.currency || 'KGS').toUpperCase();
      const paymentMethod = dto.paymentMethod ?? ProcurementPaymentInfoMethod.QR_CODE;
      const requestType =
        dto.requestType?.trim() || requestTypeForExpenseType(dto.expenseType) || null;

      if (paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT && !dto.accountNumber?.trim()) {
        throw new BadRequestException('Account number is required for bank account payment method');
      }

      if (dto.procurementOrderId) {
        const siblings = await tx.procurementTransportExpense.findMany({
          where: {
            procurementOrderId: dto.procurementOrderId,
            expenseType: dto.expenseType,
            status: { not: TransportExpenseStatus.CANCELLED },
          },
          select: { amount: true, amountKgs: true, status: true },
        });
        if (dto.sendToAccountant === true && hasActiveSectionRequest(siblings)) {
          throw new BadRequestException('An active payment request already exists for this section');
        }
        const summary = summarizeSectionPayments(
          siblings.map((row) => ({
            amount: Number(row.amount),
            amountKgs: Number(row.amountKgs),
            status: row.status,
          })),
          dto.sectionTotalAmount,
        );
        if (
          summary.remainingAmount > 0 &&
          amount > summary.remainingAmount + 0.009 &&
          Number(dto.sectionTotalAmount || 0) > 0
        ) {
          throw new BadRequestException(
            'Requested amount must not exceed the remaining unpaid amount',
          );
        }
      }

      // Always create as draft when QR — SM attaches QR then submits.
      const send =
        dto.sendToAccountant === true && paymentMethod !== ProcurementPaymentInfoMethod.QR_CODE;
      const created = await tx.procurementTransportExpense.create({
        data: {
          expenseNumber: buildFinanceDocumentNumber('TRE'),
          procurementOrderId: dto.procurementOrderId || null,
          expenseType: dto.expenseType,
          requestType,
          supplierCarrier: dto.supplierCarrier.trim(),
          transportCompanyId: dto.transportCompanyId || null,
          expenseName: dto.expenseName?.trim() || null,
          expenseCategory: dto.expenseCategory?.trim() || null,
          recipientName: dto.recipientName?.trim() || null,
          route: dto.route?.trim() || null,
          vehicleInfo: dto.vehicleInfo?.trim() || null,
          shipmentReference: dto.shipmentReference?.trim() || null,
          paymentMethod,
          bankName: dto.bankName?.trim() || null,
          accountHolder: dto.accountHolder?.trim() || null,
          accountNumber: dto.accountNumber?.trim() || null,
          swiftCode: dto.swiftCode?.trim() || null,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
          amount,
          currency,
          amountKgs: currency === 'KGS' ? amount : 0,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          comment: dto.comment?.trim() || null,
          status: send ? TransportExpenseStatus.WAITING_ACCOUNTANT : TransportExpenseStatus.DRAFT,
          submittedAt: send ? new Date() : null,
          createdById: user.id,
        },
        include: INCLUDE,
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_CREATED', created.id, null, {
        expenseNumber: created.expenseNumber,
        amount,
        currency,
        status: created.status,
        requestType,
        paymentMethod,
        procurementOrderId: created.procurementOrderId,
      });
      if (send) {
        await this.audit(tx, user, this.submitAuditAction(created.expenseType), created.id, null, {
          status: created.status,
          requestType,
          paymentMethod,
          procurementOrderId: created.procurementOrderId,
        });
        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.TRANSPORT_EXPENSE_SUBMITTED,
          entityType: 'ProcurementTransportExpense',
          entityId: created.id,
          referenceNumber: created.expenseNumber,
          message: `Transport expense ${created.expenseNumber} awaits HQ Accountant review.`,
          recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
        });
      }
      return this.toResponse(created, tx);
    });
  }

  update(user: AuthUser, id: string, dto: UpdateTransportExpenseDto) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only Supply Manager can edit transport expenses');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Transport expense not found');
      if (!EDITABLE.has(existing.status)) {
        throw new BadRequestException('Only draft or returned transport expenses can be edited');
      }
      const amount = dto.amount != null ? roundMoney(dto.amount) : Number(existing.amount);
      const currency = (dto.currency ?? existing.currency).toUpperCase();
      const paymentMethod = dto.paymentMethod ?? existing.paymentMethod;
      if (
        paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT &&
        !(dto.accountNumber !== undefined ? dto.accountNumber?.trim() : existing.accountNumber?.trim())
      ) {
        throw new BadRequestException('Account number is required for bank account payment method');
      }
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          expenseType: dto.expenseType ?? existing.expenseType,
          requestType:
            dto.requestType !== undefined
              ? dto.requestType?.trim() || null
              : existing.requestType,
          supplierCarrier: dto.supplierCarrier?.trim() || existing.supplierCarrier,
          transportCompanyId:
            dto.transportCompanyId !== undefined ? dto.transportCompanyId : existing.transportCompanyId,
          expenseName:
            dto.expenseName !== undefined ? dto.expenseName?.trim() || null : existing.expenseName,
          expenseCategory:
            dto.expenseCategory !== undefined
              ? dto.expenseCategory?.trim() || null
              : existing.expenseCategory,
          recipientName:
            dto.recipientName !== undefined
              ? dto.recipientName?.trim() || null
              : existing.recipientName,
          route: dto.route !== undefined ? dto.route?.trim() || null : existing.route,
          vehicleInfo:
            dto.vehicleInfo !== undefined ? dto.vehicleInfo?.trim() || null : existing.vehicleInfo,
          shipmentReference:
            dto.shipmentReference !== undefined
              ? dto.shipmentReference?.trim() || null
              : existing.shipmentReference,
          paymentMethod,
          bankName: dto.bankName !== undefined ? dto.bankName?.trim() || null : existing.bankName,
          accountHolder:
            dto.accountHolder !== undefined
              ? dto.accountHolder?.trim() || null
              : existing.accountHolder,
          accountNumber:
            dto.accountNumber !== undefined
              ? dto.accountNumber?.trim() || null
              : existing.accountNumber,
          swiftCode: dto.swiftCode !== undefined ? dto.swiftCode?.trim() || null : existing.swiftCode,
          invoiceNumber:
            dto.invoiceNumber !== undefined ? dto.invoiceNumber?.trim() || null : existing.invoiceNumber,
          invoiceDate:
            dto.invoiceDate !== undefined
              ? dto.invoiceDate
                ? new Date(dto.invoiceDate)
                : null
              : existing.invoiceDate,
          amount,
          currency,
          amountKgs: currency === 'KGS' ? amount : Number(existing.amountKgs),
          dueDate:
            dto.dueDate !== undefined
              ? dto.dueDate
                ? new Date(dto.dueDate)
                : null
              : existing.dueDate,
          comment: dto.comment !== undefined ? dto.comment?.trim() || null : existing.comment,
          status:
            existing.status === TransportExpenseStatus.RETURNED
              ? TransportExpenseStatus.DRAFT
              : existing.status,
        },
        include: INCLUDE,
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_UPDATED', id, {
        amount: Number(existing.amount),
        status: existing.status,
      }, {
        amount: Number(updated.amount),
        status: updated.status,
      });
      return this.toResponse(updated, tx);
    });
  }

  submitToAccountant(user: AuthUser, id: string) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (!EDITABLE.has(expense.status)) {
        throw new BadRequestException('Only draft or returned expenses can be submitted');
      }
      if (!expense.procurementOrderId) {
        throw new BadRequestException('Procurement Order must exist');
      }

      const qrCount = await tx.fileAttachment.count({
        where: {
          entityType: FileAttachmentEntityType.PAYMENT_QR,
          entityId: id,
          deletedAt: null,
        },
      });
      const invoiceCount = await tx.fileAttachment.count({
        where: {
          entityType: FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE,
          entityId: id,
          deletedAt: null,
        },
      });

      const siblings = await tx.procurementTransportExpense.findMany({
        where: {
          procurementOrderId: expense.procurementOrderId,
          expenseType: expense.expenseType,
          id: { not: id },
          status: { not: TransportExpenseStatus.CANCELLED },
        },
        select: { amount: true, amountKgs: true, status: true },
      });
      if (hasActiveSectionRequest(siblings)) {
        throw new BadRequestException('An active payment request already exists for this section');
      }

      const validationError = validateSectionPayableSubmit({
        amount: Number(expense.amount),
        currency: expense.currency,
        paymentMethod: expense.paymentMethod,
        accountNumber: expense.accountNumber,
        qrCount,
        remainingAmount: Number(expense.amount),
        hasActiveRequest: false,
        procurementOrderId: expense.procurementOrderId,
      });
      if (validationError) throw new BadRequestException(validationError);
      if (
        expense.paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT &&
        invoiceCount <= 0 &&
        !expense.invoiceNumber?.trim()
      ) {
        // Bank transfers may proceed with invoice number or attachment; QR path requires QR only.
      }

      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: TransportExpenseStatus.WAITING_ACCOUNTANT,
          submittedAt: new Date(),
          returnReason: null,
          returnedAt: null,
          returnedById: null,
          requestType: expense.requestType || requestTypeForExpenseType(expense.expenseType),
        },
        include: INCLUDE,
      });
      await this.audit(
        tx,
        user,
        this.submitAuditAction(expense.expenseType),
        id,
        { status: expense.status },
        {
          status: updated.status,
          requestType: updated.requestType,
          paymentMethod: updated.paymentMethod,
          procurementOrderId: updated.procurementOrderId,
        },
      );
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_SUBMITTED,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: `Transport expense ${expense.expenseNumber} awaits HQ Accountant review.`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });
      return this.toResponse(updated, tx);
    });
  }

  approveAndSendToCashier(user: AuthUser, id: string, dto: ApproveTransportExpenseDto) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant can approve transport expenses');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (expense.status !== TransportExpenseStatus.WAITING_ACCOUNTANT) {
        throw new BadRequestException('Expense is not waiting for accountant');
      }

      const currency = expense.currency.toUpperCase();
      let amountKgs = Number(expense.amountKgs);
      let exchangeRate = expense.exchangeRate != null ? Number(expense.exchangeRate) : null;
      if (currency === 'KGS') {
        amountKgs = Number(expense.amount);
      } else {
        if (!dto.exchangeRate || dto.exchangeRate <= 0) {
          throw new BadRequestException('Exchange rate is required for non-KGS transport expenses');
        }
        exchangeRate = Math.round(Number(dto.exchangeRate) * 10000) / 10000;
        amountKgs = roundMoney(Number(expense.amount) * exchangeRate);
      }

      if (dto.financeAccountId) {
        await this.assertHqAccount(tx, dto.financeAccountId);
      }

      const send = dto.sendToCashier !== false;
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          exchangeRate,
          amountKgs,
          financeAccountId: dto.financeAccountId || expense.financeAccountId,
          accountantComment: dto.accountantComment?.trim() || expense.accountantComment,
          accountantId: user.id,
          approvedAt: new Date(),
          status: send ? TransportExpenseStatus.PENDING_CASHIER : TransportExpenseStatus.WAITING_ACCOUNTANT,
          sentToCashierAt: send ? new Date() : null,
        },
        include: INCLUDE,
      });

      await this.audit(tx, user, 'TRANSPORT_EXPENSE_APPROVED', id, { status: expense.status }, {
        status: updated.status,
        amountKgs,
        exchangeRate,
      });

      if (send) {
        if (!updated.financeAccountId) {
          throw new BadRequestException('Finance account is required before sending to cashier');
        }
        await this.audit(tx, user, 'TRANSPORT_EXPENSE_SENT_TO_CASHIER', id, null, {
          status: updated.status,
          amountKgs,
        });
        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.TRANSPORT_EXPENSE_SENT_TO_CASHIER,
          entityType: 'ProcurementTransportExpense',
          entityId: id,
          referenceNumber: expense.expenseNumber,
          message: `Transport expense ${expense.expenseNumber} awaits HQ Cashier payment.`,
          recipientRoles: [Role.HQ_CASHIER, Role.FINANCE_MANAGER],
        });
      }

      return this.toResponse(updated, tx);
    });
  }

  returnToCreator(user: AuthUser, id: string, dto: ReturnTransportExpenseDto) {
    if (!canCreateSupplierPayment(user) && !canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (
        expense.status !== TransportExpenseStatus.WAITING_ACCOUNTANT &&
        expense.status !== TransportExpenseStatus.PENDING_CASHIER
      ) {
        throw new BadRequestException('Expense cannot be returned in current status');
      }
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: TransportExpenseStatus.RETURNED,
          returnReason: dto.reason.trim(),
          returnedAt: new Date(),
          returnedById: user.id,
        },
        include: INCLUDE,
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_RETURNED', id, { status: expense.status }, {
        status: updated.status,
        returnReason: updated.returnReason,
      });
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_RETURNED,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: `Transport expense ${expense.expenseNumber} was returned: ${dto.reason.trim()}`,
        recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER],
      });
      return this.toResponse(updated, tx);
    });
  }

  confirmPayment(user: AuthUser, id: string, dto: ConfirmTransportExpenseDto) {
    if (!canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('Only HQ Cashier can confirm transport expense payment');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (expense.status === TransportExpenseStatus.PAID) {
        throw new BadRequestException('Transport expense is already paid');
      }
      if (expense.status !== TransportExpenseStatus.PENDING_CASHIER) {
        throw new BadRequestException('Expense is not awaiting cashier payment');
      }

      const receiptCount = await tx.fileAttachment.count({
        where: {
          entityType: FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
          entityId: id,
          deletedAt: null,
        },
      });
      if (receiptCount <= 0) {
        throw new BadRequestException('Payment receipt is required');
      }

      const account = await this.assertHqAccount(tx, dto.financeAccountId);
      const amountKgs = Number(expense.amountKgs);
      if (amountKgs <= 0) throw new BadRequestException('Payable KGS amount is invalid');
      if (amountKgs > Number(account.availableBalance) + 0.009) {
        throw new BadRequestException('Insufficient balance on finance account');
      }

      const ledger = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: null,
        entryType: FinanceLedgerEntryType.EXPENSE,
        amount: amountKgs,
        currency: 'KGS',
        referenceType: 'ProcurementTransportExpense',
        referenceId: id,
        notes: `Transport expense ${expense.expenseNumber}`,
      });

      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: TransportExpenseStatus.PAID,
          financeAccountId: account.id,
          ledgerEntryId: ledger.id,
          cashierId: user.id,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          transactionNumber: dto.transactionNumber?.trim() || null,
          cashierComment: dto.cashierComment?.trim() || null,
        },
        include: INCLUDE,
      });

      await this.audit(tx, user, 'TRANSPORT_EXPENSE_PAID', id, { status: expense.status }, {
        status: updated.status,
        amountKgs,
        financeAccountId: account.id,
        ledgerEntryId: ledger.id,
        exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
      });
      await this.syncOrderSectionCostFromPaidExpenses(tx, user, updated);
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_PAID,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: `Transport expense ${expense.expenseNumber} was paid.`,
        recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });
      return this.toResponse(updated, tx);
    });
  }

  async uploadQr(user: AuthUser, id: string, request: FastifyRequest) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Forbidden');
    }
    const expense = await this.prisma.procurementTransportExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Transport expense not found');
    if (!EDITABLE.has(expense.status)) {
      throw new BadRequestException('QR codes can only be changed on draft or returned expenses');
    }
    if (expense.paymentMethod !== ProcurementPaymentInfoMethod.QR_CODE) {
      throw new BadRequestException('Payment method must be QR Code to upload QR attachments');
    }

    let file: Awaited<ReturnType<FastifyRequest['file']>>;
    try {
      file = await request.file();
    } catch {
      throw new BadRequestException('File is too large');
    }
    if (!file) throw new BadRequestException('File is required');

    const allowed = new Map([
      ['application/pdf', '.pdf'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
    ]);
    const extFromMime = allowed.get(file.mimetype);
    const originalExt = extname(file.filename).toLowerCase();
    if (!extFromMime || !['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(originalExt)) {
      throw new BadRequestException('Invalid file format');
    }
    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) throw new BadRequestException('File is too large');

    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const description = fields?.description?.value?.trim() || null;

    const dir = join(process.cwd(), 'uploads', 'procurement');
    await mkdir(dir, { recursive: true });
    const extension = originalExt === '.jpeg' ? '.jpg' : extFromMime;
    const stored = `${randomUUID()}${extension}`;
    await writeFile(join(dir, stored), buffer);
    const fileUrl = `/uploads/procurement/${stored}`;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({
        data: {
          entityType: FileAttachmentEntityType.PAYMENT_QR,
          entityId: id,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          size: buffer.length,
          description,
          uploadedById: user.id,
        },
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_QR_UPLOADED', id, null, {
        attachmentId: created.id,
        fileName: created.fileName,
        description,
        procurementOrderId: expense.procurementOrderId,
        requestType: expense.requestType,
      });
      return created;
    });
  }

  removeQr(user: AuthUser, id: string, attachmentId: string) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (!EDITABLE.has(expense.status)) {
        throw new BadRequestException('QR codes can only be changed on draft or returned expenses');
      }
      const attachment = await tx.fileAttachment.findFirst({
        where: {
          id: attachmentId,
          entityId: id,
          entityType: FileAttachmentEntityType.PAYMENT_QR,
          deletedAt: null,
        },
      });
      if (!attachment) throw new NotFoundException('QR attachment not found');
      await tx.fileAttachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_QR_REMOVED', id, {
        attachmentId,
        fileName: attachment.fileName,
      }, null);
      return { id: attachmentId, deleted: true };
    });
  }

  async uploadAttachment(
    user: AuthUser,
    id: string,
    request: FastifyRequest,
    entityType: FileAttachmentEntityType,
  ) {
    const expense = await this.prisma.procurementTransportExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Transport expense not found');

    const roles = resolveUserRoles(user);
    const canUploadInvoice =
      canCreateProcurementOrder(user) || hasAnyFullAccessRole(roles);
    const canUploadReceipt = canConfirmSupplierPayment(user);
    if (
      (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE ||
        entityType === FileAttachmentEntityType.PAYMENT_QR) &&
      !canUploadInvoice
    ) {
      throw new ForbiddenException('Forbidden');
    }
    if (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT && !canUploadReceipt) {
      throw new ForbiddenException('Forbidden');
    }
    if (
      entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE &&
      !EDITABLE.has(expense.status) &&
      !hasAnyFullAccessRole(roles)
    ) {
      throw new BadRequestException('Invoice can only be attached to draft or returned expenses');
    }

    let file: Awaited<ReturnType<FastifyRequest['file']>>;
    try {
      file = await request.file();
    } catch {
      throw new BadRequestException('File is too large');
    }
    if (!file) throw new BadRequestException('File is required');

    const allowed = new Map([
      ['application/pdf', '.pdf'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
    ]);
    const extFromMime = allowed.get(file.mimetype);
    const originalExt = extname(file.filename).toLowerCase();
    if (!extFromMime || !['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(originalExt)) {
      throw new BadRequestException('Invalid file format');
    }
    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) throw new BadRequestException('File is too large');

    const dir = join(process.cwd(), 'uploads', 'procurement');
    await mkdir(dir, { recursive: true });
    const extension = originalExt === '.jpeg' ? '.jpg' : extFromMime;
    const stored = `${randomUUID()}${extension}`;
    await writeFile(join(dir, stored), buffer);
    const fileUrl = `/uploads/procurement/${stored}`;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({
        data: {
          entityType,
          entityId: id,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          size: buffer.length,
          uploadedById: user.id,
        },
      });
      await this.audit(
        tx,
        user,
        entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT
          ? 'TRANSPORT_EXPENSE_RECEIPT_UPLOADED'
          : 'TRANSPORT_EXPENSE_INVOICE_UPLOADED',
        id,
        null,
        { attachmentId: created.id, fileName: created.fileName },
      );
      return created;
    });
  }

  private assertCanView(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (
      canCreateProcurementOrder(user) ||
      canCreateSupplierPayment(user) ||
      canConfirmSupplierPayment(user) ||
      hasAnyFullAccessRole(roles)
    ) {
      return;
    }
    throw new ForbiddenException('Forbidden');
  }

  private async assertHqAccount(tx: Tx, accountId: string) {
    const account = await tx.financeAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    if (account.scope !== FinanceAccountScope.HQ) {
      throw new BadRequestException('Only HQ finance accounts are allowed');
    }
    if (account.status !== FinanceAccountStatus.ACTIVE) {
      throw new BadRequestException('Finance account must be active');
    }
    return account;
  }

  private async toResponse(expense: any, tx?: Tx) {
    const db = tx ?? this.prisma;
    const attachments = await db.fileAttachment.findMany({
      where: { entityId: expense.id, deletedAt: null },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...expense,
      amount: Number(expense.amount),
      amountKgs: Number(expense.amountKgs),
      exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
      invoices: attachments.filter(
        (a) => a.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE,
      ),
      receipts: attachments.filter(
        (a) => a.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
      ),
      qrCodes: attachments.filter((a) => a.entityType === FileAttachmentEntityType.PAYMENT_QR),
      attachments,
    };
  }

  private submitAuditAction(expenseType: TransportExpenseType): string {
    switch (expenseType) {
      case TransportExpenseType.DOMESTIC_CHINA_TRANSPORT:
        return 'CHINA_TRANSPORT_INVOICE_SENT';
      case TransportExpenseType.INTERNATIONAL_FREIGHT:
        return 'CARGO_INVOICE_SENT';
      case TransportExpenseType.LOCAL_DELIVERY:
        return 'KYRGYZSTAN_TRANSPORT_INVOICE_SENT';
      case TransportExpenseType.OTHER_LOGISTICS:
        return 'OTHER_EXPENSE_INVOICE_SENT';
      default:
        return 'TRANSPORT_EXPENSE_SUBMITTED';
    }
  }

  private async syncOrderSectionCostFromPaidExpenses(
    tx: Tx,
    user: AuthUser,
    expense: {
      id: string;
      procurementOrderId: string | null;
      expenseType: TransportExpenseType;
      amountKgs: unknown;
    },
  ) {
    if (!expense.procurementOrderId) return;
    const order = await tx.procurementOrder.findFirst({
      where: { id: expense.procurementOrderId, deletedAt: null },
    });
    if (!order) return;

    const siblings = await tx.procurementTransportExpense.findMany({
      where: {
        procurementOrderId: expense.procurementOrderId,
        expenseType: expense.expenseType,
        status: { not: TransportExpenseStatus.CANCELLED },
      },
      select: {
        amount: true,
        currency: true,
        exchangeRate: true,
        amountKgs: true,
        status: true,
      },
    });

    const estimatedRate =
      order.weightedAverageYuanRate != null && Number(order.totalPaidYuan) > 0
        ? Number(order.weightedAverageYuanRate)
        : Number(order.defaultYuanRate);

    const sectionTotal =
      expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT
        ? Number(order.chinaDomesticTransportYuan || 0)
        : expense.expenseType === TransportExpenseType.LOCAL_DELIVERY
          ? Number(order.localTransportKgs || 0)
          : expense.expenseType === TransportExpenseType.OTHER_LOGISTICS
            ? Number(order.otherExpenseKgs || 0)
            : expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
              ? Number(order.totalCargoCostKgs || 0)
              : 0;

    const section = estimateSectionExpenseCostKgs({
      expenses: siblings.map((row) => ({
        amount: Number(row.amount),
        currency: row.currency,
        exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
        amountKgs: Number(row.amountKgs),
        status: row.status,
      })),
      sectionTotalAmount: sectionTotal,
      estimatedYuanRate: estimatedRate,
      defaultCurrency:
        expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT ? 'CNY' : 'KGS',
    });

    const data: Prisma.ProcurementOrderUpdateInput = {};
    if (expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT) {
      data.chinaDomesticTransportKgs = section.estimatedSectionCostKgs;
    } else if (expense.expenseType === TransportExpenseType.LOCAL_DELIVERY) {
      data.localTransportKgs = section.estimatedSectionCostKgs;
    } else if (expense.expenseType === TransportExpenseType.OTHER_LOGISTICS) {
      // Keep the declared other-expense budget; cost engine uses full section estimate.
      if (section.sectionTotalAmount > Number(order.otherExpenseKgs || 0)) {
        data.otherExpenseKgs = section.sectionTotalAmount;
      }
    } else if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
      data.chinaExportTransportKgs = section.estimatedSectionCostKgs;
      data.totalCargoCostKgs = section.estimatedSectionCostKgs;
    }

    if (Object.keys(data).length > 0) {
      const updated = await tx.procurementOrder.update({
        where: { id: order.id },
        data,
      });
      await this.audit(tx, user, 'PROCUREMENT_COST_RECALCULATED', order.id, {
        chinaDomesticTransportKgs: Number(order.chinaDomesticTransportKgs),
        localTransportKgs: Number(order.localTransportKgs),
        otherExpenseKgs: Number(order.otherExpenseKgs),
        totalCargoCostKgs: Number(order.totalCargoCostKgs),
      }, {
        chinaDomesticTransportKgs: Number(updated.chinaDomesticTransportKgs),
        localTransportKgs: Number(updated.localTransportKgs),
        otherExpenseKgs: Number(updated.otherExpenseKgs),
        totalCargoCostKgs: Number(updated.totalCargoCostKgs),
        sourceExpenseId: expense.id,
        sectionTotalAmount: section.sectionTotalAmount,
        estimatedSectionCostKgs: section.estimatedSectionCostKgs,
        paidSectionAmount: section.paidAmount,
        expenseType: expense.expenseType,
        note: 'Full section amount used for cost; unpaid balance remains in inventory cost',
      });
    }

    try {
      await this.landedCostService.recalculateProcurementOrder(
        order.id,
        { user, reason: 'transport-expense-paid', triggerReason: 'transport-expense-paid' },
        tx,
      );
    } catch {
      // Weight/finalized gates may block recalculation; section totals above remain updated.
    }
  }

  private async audit(
    tx: Tx,
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
        entity: 'ProcurementTransportExpense',
        entityId,
        metadata: {
          actorId: user.id,
          actorName: user.fullName ?? user.email,
          timestamp: new Date().toISOString(),
          oldValue: oldValue as Prisma.InputJsonValue | null,
          newValue: newValue as Prisma.InputJsonValue | null,
        },
      },
    });
  }
}
