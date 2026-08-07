import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  FileAttachmentEntityType,
  NotificationModule,
  Prisma,
  ProcurementKgsAdjustmentReason,
  ProcurementOrderStatus,
  ProcurementPaymentInfoMethod,
  ProcurementSupplierPaymentMethod,
  ProcurementSupplierPaymentStatus,
  ProcurementSupplierPaymentLedgerStatus,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import {
  assertHqCashierAssignedAccount,
  getActiveAssignmentAccountIds,
} from '../finance/finance-assignment.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  deliverReceiptsToCreatorInTx,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';
import {
  canAllowSupplierOverpayment,
  canChangeSupplierPaymentFinanceAccount,
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canEditSupplierPayment,
  canPermanentDeleteBusinessData,
  canReturnSupplierPaymentToAccountant,
  canProcessHqCargoPayment,
  canReverseSupplierPayment,
  canSendProcurementInvoiceToAccountant,
  canSendSupplierPaymentToCashier,
  canVoidSupplierPayment,
  canViewSupplierPayments,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { auditPaymentPermanentlyDeleted } from '../rbac/payment-permanent-delete.audit';
import { ConfirmSupplierPaymentDto } from './dto/confirm-supplier-payment.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ReturnSupplierPaymentDto } from './dto/return-supplier-payment.dto';
import { ReverseSupplierPaymentDto } from './dto/reverse-supplier-payment.dto';
import { resolveSupplierPaymentMethodFromAccountType } from './supplier-payment-method-from-account.util';
import { SendInvoiceToAccountantDto } from './dto/send-invoice-to-accountant.dto';
import { UpdateSupplierPaymentDto } from './dto/update-supplier-payment.dto';
import { VoidSupplierPaymentDto } from './dto/void-supplier-payment.dto';
import type { PermanentDeleteHqPaymentDto } from './dto/permanent-delete-hq-payment.dto';
import { LandedCostService } from './landed-cost.service';
import {
  calculateAmountKgs,
  isAllocatedSupplierPayment,
  isConfirmedSupplierPayment,
  maskCardNumber,
  resolveSupplierPaymentKgs,
  roundMoney,
  summarizeSupplierPayments,
} from './supplier-payment.util';
import {
  SUPPLIER_ACCOUNTANT_PAYABLE,
  SUPPLIER_RETURN_BLOCKED_MESSAGE,
} from './supplier-bill-actions.util';
import { resolveApprovedSupplierCostBaseYuan } from './procurement-cost.util';
import {
  calculateApprovedSupplierKgsFromRate,
  resolveSupplierPaymentExchangeRate,
  SUPPLIER_CNY_RATE_REQUIRED_MESSAGE,
} from './supplier-payment-exchange-rate.util';

type Tx = Prisma.TransactionClient;

const EDITABLE_PAYMENT_STATUSES = new Set<string>([
  ProcurementSupplierPaymentStatus.DRAFT,
  ProcurementSupplierPaymentStatus.RETURNED,
]);

const PAYMENT_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, role: true } },
  accountant: { select: { id: true, fullName: true, role: true } },
  cashier: { select: { id: true, fullName: true, role: true } },
  voidedBy: { select: { id: true, fullName: true, role: true } },
  returnedBy: { select: { id: true, fullName: true, role: true } },
  kgsAdjustedBy: { select: { id: true, fullName: true, role: true } },
  paymentInfoVersion: true,
  intendedFinanceAccount: {
    select: { id: true, name: true, accountNumber: true, currentBalance: true, availableBalance: true, status: true, scope: true },
  },
  actualFinanceAccount: {
    select: { id: true, name: true, accountNumber: true, currentBalance: true, availableBalance: true, status: true, scope: true },
  },
  attachments: {
    where: { deletedAt: null },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
} as const;

@Injectable()
export class SupplierPaymentWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly financeLedgerService: FinanceLedgerService,
    private readonly landedCostService: LandedCostService,
  ) {}

  assertCanView(user: AuthUser) {
    if (!canViewSupplierPayments(user)) {
      throw new ForbiddenException('You do not have permission to view supplier payments');
    }
  }

  async listPayments(user: AuthUser, orderId: string) {
    this.assertCanView(user);
    await this.getOrderOrThrow(orderId);
    const payments = await this.prisma.procurementSupplierPayment.findMany({
      where: { procurementOrderId: orderId },
      include: PAYMENT_INCLUDE,
      orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }],
    });
    return payments.map((payment) => this.toPaymentResponse(payment));
  }

  /**
   * Supply Manager inbox: every saved purchase order appears here automatically
   * (UNPAID) until fully paid. Used by Supply Manager → Платежи поставщику.
   */
  async listSupplyManagerPaymentQueue(user: AuthUser) {
    this.assertCanView(user);
    const orders = await this.prisma.procurementOrder.findMany({
      where: {
        deletedAt: null,
        OR: [
          { remainingYuan: { gt: 0 } },
          {
            supplierPaymentStatus: {
              in: [
                'UNPAID',
                'AWAITING_ACCOUNTANT',
                'AWAITING_CASHIER',
                'PARTIALLY_PAID',
                'OVERPAID',
              ],
            },
          },
          {
            supplierPayments: {
              some: {
                status: {
                  in: [
                    ProcurementSupplierPaymentStatus.DRAFT,
                    ProcurementSupplierPaymentStatus.RETURNED,
                    ProcurementSupplierPaymentStatus.PENDING_CASHIER,
                    ProcurementSupplierPaymentStatus.ACTIVE,
                  ],
                },
              },
            },
          },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true } },
        invoiceSentBy: { select: { id: true, fullName: true } },
        paymentInfoVersions: {
          where: { isActive: true },
          take: 1,
          select: { id: true, paymentMethod: true, versionNumber: true },
        },
        supplierPayments: {
          include: PAYMENT_INCLUDE,
          orderBy: [{ sequenceNumber: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      take: 300,
    });
    return orders.map((order) => ({
      ...this.toOrderPaymentSummary(order),
      hasPaymentInfo: (order.paymentInfoVersions?.length ?? 0) > 0,
      activePaymentMethod: order.paymentInfoVersions?.[0]?.paymentMethod ?? null,
    }));
  }

  async listAccountantQueue(user: AuthUser) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to review supplier invoices');
    }
    const orders = await this.prisma.procurementOrder.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            invoiceSentToAccountantAt: { not: null },
            supplierPaymentStatus: {
              in: [
                'AWAITING_ACCOUNTANT',
                'AWAITING_CASHIER',
                'PARTIALLY_PAID',
                'PAYMENT_POSTPONED',
                'UNPAID',
              ],
            },
          },
          {
            supplierPayments: {
              some: {
                status: {
                  in: [
                    ProcurementSupplierPaymentStatus.DRAFT,
                    ProcurementSupplierPaymentStatus.RETURNED,
                    ProcurementSupplierPaymentStatus.PENDING_CASHIER,
                  ],
                },
              },
            },
          },
          { remainingYuan: { gt: 0 }, invoiceSentToAccountantAt: { not: null } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true } },
        invoiceSentBy: { select: { id: true, fullName: true } },
        supplierPayments: {
          include: PAYMENT_INCLUDE,
          orderBy: [{ sequenceNumber: 'asc' }],
        },
      },
      orderBy: [{ invoiceSentToAccountantAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return orders.map((order) => this.toOrderPaymentSummary(order));
  }

  async listCashierQueue(user: AuthUser) {
    if (!canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to complete supplier payments');
    }
    const payments = await this.prisma.procurementSupplierPayment.findMany({
      where: { status: ProcurementSupplierPaymentStatus.PENDING_CASHIER },
      include: {
        ...PAYMENT_INCLUDE,
        procurementOrder: {
          include: {
            supplier: { select: { id: true, name: true } },
            supplierPayments: {
              where: { status: ProcurementSupplierPaymentStatus.ACTIVE },
              select: {
                id: true,
                sequenceNumber: true,
                amountYuan: true,
                exchangeRate: true,
                amountKgs: true,
                status: true,
                paymentDate: true,
              },
              orderBy: { sequenceNumber: 'asc' },
            },
          },
        },
      },
      orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return payments.map((payment) => ({
      ...this.toPaymentResponse(payment),
      order: payment.procurementOrder
        ? {
            id: payment.procurementOrder.id,
            orderNumber: payment.procurementOrder.orderNumber,
            supplier: payment.procurementOrder.supplier,
            totalYuan: Number(payment.procurementOrder.totalYuan),
            totalPaidYuan: Number(payment.procurementOrder.totalPaidYuan ?? 0),
            remainingYuan: Number(payment.procurementOrder.remainingYuan ?? 0),
            supplierPaymentStatus: payment.procurementOrder.supplierPaymentStatus,
            previousPayments: payment.procurementOrder.supplierPayments,
          }
        : null,
    }));
  }

  async listHqFinanceAccounts(user: AuthUser) {
    if (!canProcessHqCargoPayment(user) && !canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('Forbidden');
    }
    const roles = resolveUserRoles(user);
    const restrictToAssigned =
      roles.includes(Role.HQ_CASHIER) &&
      !hasAnyFullAccessRole(roles) &&
      !roles.includes(Role.HQ_ACCOUNTANT) &&
      !roles.includes(Role.FINANCE_MANAGER);
    const assignedAccountIds = restrictToAssigned
      ? await getActiveAssignmentAccountIds(this.prisma, user.id)
      : null;
    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        deletedAt: null,
        scope: FinanceAccountScope.HQ,
        status: FinanceAccountStatus.ACTIVE,
        ...(restrictToAssigned ? { id: { in: [...(assignedAccountIds ?? [])] } } : {}),
      },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        currency: true,
        currentBalance: true,
        availableBalance: true,
        pendingBalance: true,
        typeCode: true,
        status: true,
        scope: true,
      },
      orderBy: { name: 'asc' },
    });

    // Reuse ledger balance sync so investment credits appear in payment selectors.
    await this.prisma.$transaction(async (tx) => {
      await this.financeLedgerService.syncAccountBalances(
        tx,
        accounts.map((account) => account.id),
      );
    });

    const refreshed = await this.prisma.financeAccount.findMany({
      where: { id: { in: accounts.map((account) => account.id) } },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        currency: true,
        currentBalance: true,
        availableBalance: true,
        pendingBalance: true,
        typeCode: true,
        status: true,
        scope: true,
      },
      orderBy: { name: 'asc' },
    });

    return refreshed.map((account) => ({
      ...account,
      currentBalance: Number(account.currentBalance),
      availableBalance: Number(account.availableBalance),
      pendingBalance: Number(account.pendingBalance),
    }));
  }

  sendInvoiceToAccountant(user: AuthUser, orderId: string, dto: SendInvoiceToAccountantDto) {
    if (!canSendProcurementInvoiceToAccountant(user)) {
      throw new ForbiddenException('You do not have permission to send invoices to the accountant');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);

      const reviewStatus = String(order.invoiceReviewStatus || '').toUpperCase();
      const canResubmitAfterReturn = reviewStatus === 'RETURNED';

      // One send per invoice: once stamped, block repeats except accountant-return resubmit.
      if (order.invoiceSentToAccountantAt && !canResubmitAfterReturn) {
        throw new BadRequestException(
          'Supplier invoice was already sent to the accountant for this procurement order',
        );
      }
      if (
        !canResubmitAfterReturn &&
        (order.supplierPaymentStatus === 'AWAITING_ACCOUNTANT' ||
          order.supplierPaymentStatus === 'AWAITING_CASHIER' ||
          reviewStatus === 'UNDER_REVIEW' ||
          reviewStatus === 'APPROVED' ||
          reviewStatus === 'SUBMITTED')
      ) {
        throw new BadRequestException(
          'An active supplier payment request already exists for this procurement order',
        );
      }
      if (reviewStatus === 'REJECTED') {
        throw new BadRequestException('Rejected supplier invoice cannot be resubmitted');
      }

      const remainingOrTotal = roundMoney(
        Number(order.remainingYuan ?? 0) > 0
          ? Number(order.remainingYuan)
          : Number(order.totalYuan ?? 0),
      );
      const requestedPaymentYuan = roundMoney(
        dto.requestedPaymentYuan != null ? Number(dto.requestedPaymentYuan) : remainingOrTotal,
      );
      if (requestedPaymentYuan <= 0) {
        throw new BadRequestException('Requested CNY payment amount must be greater than zero');
      }

      const paymentMethod =
        dto.paymentMethod ??
        (
          await tx.procurementPaymentInfoVersion.findFirst({
            where: { procurementOrderId: order.id, isActive: true },
            select: { paymentMethod: true },
          })
        )?.paymentMethod ??
        ProcurementPaymentInfoMethod.BANK_ACCOUNT;

      let activePaymentInfo = await tx.procurementPaymentInfoVersion.findFirst({
        where: { procurementOrderId: order.id, isActive: true },
      });

      if (dto.paymentMethod || dto.accountNumber || dto.bankName || dto.accountHolder) {
        if (paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT && !dto.accountNumber?.trim() && !activePaymentInfo?.accountNumber?.trim()) {
          throw new BadRequestException('Account number is required for bank account payment method');
        }
        if (!activePaymentInfo) {
          activePaymentInfo = await tx.procurementPaymentInfoVersion.create({
            data: {
              procurementOrderId: order.id,
              versionNumber: 1,
              paymentMethod,
              bankName: dto.bankName?.trim() || null,
              accountHolder: dto.accountHolder?.trim() || null,
              accountNumber: dto.accountNumber?.trim() || null,
              isActive: true,
              createdById: user.id,
            },
          });
          await this.audit(tx, user, 'PAYMENT_INFO_CREATED', order.id, null, {
            versionId: activePaymentInfo.id,
            paymentMethod,
          });
        } else {
          const oldMethod = activePaymentInfo.paymentMethod;
          activePaymentInfo = await tx.procurementPaymentInfoVersion.update({
            where: { id: activePaymentInfo.id },
            data: {
              paymentMethod,
              bankName:
                dto.bankName !== undefined ? dto.bankName?.trim() || null : activePaymentInfo.bankName,
              accountHolder:
                dto.accountHolder !== undefined
                  ? dto.accountHolder?.trim() || null
                  : activePaymentInfo.accountHolder,
              accountNumber:
                dto.accountNumber !== undefined
                  ? dto.accountNumber?.trim() || null
                  : activePaymentInfo.accountNumber,
            },
          });
          if (oldMethod !== activePaymentInfo.paymentMethod) {
            await this.audit(tx, user, 'PAYMENT_INFO_BANK_ACCOUNT_CHANGED', order.id, {
              paymentMethod: oldMethod,
            }, { paymentMethod: activePaymentInfo.paymentMethod });
          }
        }
      }

      if (!activePaymentInfo) {
        throw new BadRequestException(
          'Add payment method and payment instructions before sending to HQ Accountant',
        );
      }

      if (activePaymentInfo.paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT) {
        if (!activePaymentInfo.accountNumber?.trim()) {
          throw new BadRequestException(
            'Account number is required for bank account payment method',
          );
        }
      }
      if (activePaymentInfo.paymentMethod === ProcurementPaymentInfoMethod.QR_CODE) {
        const qrCount = await tx.fileAttachment.count({
          where: {
            entityType: FileAttachmentEntityType.PAYMENT_QR,
            entityId: activePaymentInfo.id,
            deletedAt: null,
          },
        });
        if (qrCount <= 0) {
          throw new BadRequestException(
            'Attach at least one payment QR code before sending to HQ Accountant',
          );
        }
      }

      const updated = await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          supplierInvoiceNumber: dto.supplierInvoiceNumber?.trim() || order.supplierInvoiceNumber,
          note: dto.note !== undefined ? dto.note.trim() || null : order.note,
          requestedPaymentYuan,
          invoiceSentToAccountantAt: order.invoiceSentToAccountantAt ?? new Date(),
          invoiceSentById: order.invoiceSentById ?? user.id,
          invoiceReviewStatus: 'SUBMITTED',
          invoiceReturnReason: null,
          invoiceRejectReason: null,
          invoiceReviewedAt: null,
          invoiceReviewedById: null,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          invoiceSentBy: { select: { id: true, fullName: true } },
          supplierPayments: true,
        },
      });

      const synced = await this.syncOrderPaymentState(tx, user, updated.id, 'Invoice sent to HQ Accountant');
      await this.audit(tx, user, 'SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT', order.id, {
        invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
        supplierPaymentStatus: order.supplierPaymentStatus,
        requestedPaymentYuan: order.requestedPaymentYuan,
      }, {
        invoiceSentToAccountantAt: updated.invoiceSentToAccountantAt,
        supplierPaymentStatus: synced.supplierPaymentStatus,
        requestedPaymentYuan,
        paymentInfoVersionId: activePaymentInfo.id,
        paymentMethod: activePaymentInfo.paymentMethod,
        totalProcurementYuan: Number(order.totalYuan),
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: updated.orderNumber,
        message: `Supplier payment request for procurement ${updated.orderNumber} (${requestedPaymentYuan} CNY) awaits HQ Accountant.`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER],
      });

      return synced;
    });
  }

  createPayment(user: AuthUser, orderId: string, dto: CreateSupplierPaymentDto) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to prepare supplier payments');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.procurementSupplierPayment.findFirst({
          where: { idempotencyKey: dto.idempotencyKey },
          include: PAYMENT_INCLUDE,
        });
        if (existing) {
          return {
            payment: this.toPaymentResponse(existing),
            order: await this.getOrderSummary(tx, existing.procurementOrderId),
          };
        }
      }

      const order = await this.lockOrder(tx, orderId);
      if (!order.invoiceSentToAccountantAt && !hasAnyFullAccessRole(resolveUserRoles(user))) {
        throw new BadRequestException('Supplier invoice must be sent to HQ Accountant before creating payments');
      }

      const amountYuan = roundMoney(dto.amountYuan);
      const exchangeRate = roundMoney(dto.exchangeRate, 4);
      this.validateAmounts(amountYuan, exchangeRate);

      const calculatedAmountKgs = calculateAmountKgs(amountYuan, exchangeRate);
      const approvedAmountKgs = roundMoney(dto.approvedAmountKgs ?? calculatedAmountKgs);
      if (approvedAmountKgs <= 0) {
        throw new BadRequestException('Approved KGS amount must be greater than zero');
      }

      const adjustment = this.resolveKgsAdjustment(
        user,
        calculatedAmountKgs,
        approvedAmountKgs,
        dto.kgsAdjustmentReason,
        dto.kgsAdjustmentComment,
      );

      await this.assertYuanAllocationAllowed(
        tx,
        user,
        order,
        amountYuan,
        dto.allowOverpayment === true,
      );

      const paymentInfo = await tx.procurementPaymentInfoVersion.findFirst({
        where: { procurementOrderId: order.id, isActive: true },
      });
      const intendedAccount = dto.intendedFinanceAccountId
        ? await this.assertHqFinanceAccount(tx, dto.intendedFinanceAccountId)
        : null;

      // When an HQ account is selected, payment method is derived from account type.
      // Client-provided paymentMethod is ignored (backend is authoritative).
      let paymentMethod: ProcurementSupplierPaymentMethod;
      let paymentMethodDerivedFromAccount = false;
      if (intendedAccount) {
        paymentMethod = resolveSupplierPaymentMethodFromAccountType(intendedAccount.typeCode);
        paymentMethodDerivedFromAccount = true;
      } else {
        paymentMethod =
          dto.paymentMethod ??
          (paymentInfo?.paymentMethod === ProcurementPaymentInfoMethod.QR_CODE
            ? ProcurementSupplierPaymentMethod.QR_CODE
            : ProcurementSupplierPaymentMethod.BANK_ACCOUNT);
      }

      const dtoWithPaymentInfo = {
        ...dto,
        paymentMethod,
        bankName: dto.bankName ?? paymentInfo?.bankName ?? undefined,
        beneficiaryName: dto.beneficiaryName ?? paymentInfo?.accountHolder ?? undefined,
        accountNumber: dto.accountNumber ?? paymentInfo?.accountNumber ?? undefined,
        swiftCode: dto.swiftCode ?? paymentInfo?.swiftCode ?? undefined,
        recipientName: dto.recipientName ?? paymentInfo?.accountHolder ?? undefined,
        paymentInstructions:
          dto.paymentInstructions ??
          paymentInfo?.comment ??
          (paymentInfo?.bankAddress ? `Bank address: ${paymentInfo.bankAddress}` : undefined),
      };

      const recipientFields = this.validateAndBuildRecipientFields(paymentMethod, dtoWithPaymentInfo);

      if (intendedAccount && approvedAmountKgs > Number(intendedAccount.availableBalance)) {
        if (!dto.allowInsufficientBalance) {
          throw new BadRequestException(
            `Approved amount ${approvedAmountKgs} KGS exceeds available balance ${Number(intendedAccount.availableBalance)} KGS on account ${intendedAccount.name}`,
          );
        }
      }

      const sequenceNumber = await this.nextSequenceNumber(tx, order.id);
      const sendToCashier = dto.sendToCashier === true;
      if (sendToCashier) {
        if (!canSendSupplierPaymentToCashier(user)) {
          throw new ForbiddenException('You do not have permission to send payments to cashier');
        }
        if (!intendedAccount) {
          throw new BadRequestException('Intended HQ Finance Account is required before sending to cashier');
        }
        if (!recipientFields.recipientName) {
          throw new BadRequestException('Recipient name is required before sending to cashier');
        }
      }

      const payment = await tx.procurementSupplierPayment.create({
        data: {
          procurementOrderId: order.id,
          supplierId: order.supplierId,
          paymentInfoVersionId: paymentInfo?.id ?? null,
          sequenceNumber,
          paymentDate: new Date(dto.paymentDate ?? new Date().toISOString()),
          amountYuan,
          exchangeRate,
          calculatedAmountKgs,
          approvedAmountKgs,
          amountKgs: approvedAmountKgs,
          kgsAdjustmentReason: adjustment.reason,
          kgsAdjustmentComment: adjustment.comment,
          kgsAdjustedById: adjustment.adjustedById,
          kgsAdjustedAt: adjustment.adjustedAt,
          paymentMethod,
          ...recipientFields,
          paymentDeadline: dto.paymentDeadline ? new Date(dto.paymentDeadline) : null,
          intendedFinanceAccountId: intendedAccount?.id ?? null,
          receiptNumber: dto.receiptNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
          accountantComment: dto.accountantComment?.trim() || null,
          status: sendToCashier
            ? ProcurementSupplierPaymentStatus.PENDING_CASHIER
            : ProcurementSupplierPaymentStatus.DRAFT,
          sentToCashierAt: sendToCashier ? new Date() : null,
          executionStatus: sendToCashier ? 'PENDING_EXECUTION' : null,
          executionStartedAt: null,
          failureReason: null,
          accountantId: user.id,
          createdById: user.id,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
        },
        include: PAYMENT_INCLUDE,
      });

      if (sendToCashier) {
        await this.ensureSupplierInvoiceApprovedForCosting(tx, user, order.id);
      }

      const synced = await this.syncOrderPaymentState(
        tx,
        user,
        order.id,
        sendToCashier ? 'Payment sent to HQ Cashier' : 'Payment tranche created',
      );

      await this.audit(tx, user, 'SUPPLIER_PAYMENT_CREATED', order.id, null, {
        paymentId: payment.id,
        sequenceNumber,
        amountYuan,
        exchangeRate,
        calculatedAmountKgs,
        approvedAmountKgs,
        paymentMethod,
        status: payment.status,
        intendedFinanceAccountId: payment.intendedFinanceAccountId,
      });

      await this.audit(tx, user, 'SUPPLIER_PARTIAL_PAYMENT_CREATED', order.id, null, {
        invoiceId: order.id,
        paymentId: payment.id,
        accountId: intendedAccount?.id ?? null,
        accountType: intendedAccount?.typeCode ?? null,
        derivedPaymentMethod: paymentMethod,
        amount: amountYuan,
        actorUserId: user.id,
        timestamp: new Date().toISOString(),
      });

      if (paymentMethodDerivedFromAccount && intendedAccount) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_METHOD_DERIVED', order.id, {
          clientPaymentMethod: dto.paymentMethod ?? null,
        }, {
          invoiceId: order.id,
          paymentId: payment.id,
          accountId: intendedAccount.id,
          accountType: intendedAccount.typeCode,
          derivedPaymentMethod: paymentMethod,
          amount: amountYuan,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }

      if (adjustment.reason) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_KGS_ADJUSTED', order.id, {
          calculatedAmountKgs,
        }, {
          paymentId: payment.id,
          approvedAmountKgs,
          difference: roundMoney(approvedAmountKgs - calculatedAmountKgs),
          reason: adjustment.reason,
          comment: adjustment.comment,
        });
      }

      if (sendToCashier) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', order.id, null, {
          paymentId: payment.id,
          sequenceNumber,
          approvedAmountKgs,
        });
        await this.notifyPaymentSentToCashier(tx, user, synced.orderNumber, order.id, payment.id);
      }

      return {
        payment: this.toPaymentResponse(payment),
        order: synced,
      };
    });
  }

  updatePayment(user: AuthUser, orderId: string, paymentId: string, dto: UpdateSupplierPaymentDto) {
    if (!canEditSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to edit supplier payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      if (!EDITABLE_PAYMENT_STATUSES.has(payment.status) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
        throw new BadRequestException('Only draft or returned payments can be edited');
      }
      if (isConfirmedSupplierPayment(payment.status)) {
        throw new BadRequestException('Completed payments cannot be edited directly; use reversal');
      }

      const amountYuan = roundMoney(dto.amountYuan ?? Number(payment.amountYuan));
      const exchangeRate = roundMoney(dto.exchangeRate ?? Number(payment.exchangeRate), 4);
      this.validateAmounts(amountYuan, exchangeRate);
      const calculatedAmountKgs = calculateAmountKgs(amountYuan, exchangeRate);
      const approvedAmountKgs = roundMoney(
        dto.approvedAmountKgs ?? (Number(payment.approvedAmountKgs) || calculatedAmountKgs),
      );
      const adjustment = this.resolveKgsAdjustment(
        user,
        calculatedAmountKgs,
        approvedAmountKgs,
        dto.kgsAdjustmentReason ?? payment.kgsAdjustmentReason ?? undefined,
        dto.kgsAdjustmentComment ?? payment.kgsAdjustmentComment ?? undefined,
      );

      await this.assertYuanAllocationAllowed(
        tx,
        user,
        order,
        amountYuan,
        dto.allowOverpayment === true,
        payment.id,
      );

      const intendedFinanceAccountId = dto.intendedFinanceAccountId ?? payment.intendedFinanceAccountId;
      const intendedAccount = intendedFinanceAccountId
        ? await this.assertHqFinanceAccount(tx, intendedFinanceAccountId)
        : null;

      // Account type is authoritative when an HQ account is selected.
      const paymentMethod = intendedAccount
        ? resolveSupplierPaymentMethodFromAccountType(intendedAccount.typeCode)
        : (dto.paymentMethod ?? payment.paymentMethod);
      const recipientFields = this.validateAndBuildRecipientFields(paymentMethod, {
        recipientName: dto.recipientName ?? payment.recipientName ?? undefined,
        recipientCompany: dto.recipientCompany ?? payment.recipientCompany ?? undefined,
        bankName: dto.bankName ?? payment.bankName ?? undefined,
        beneficiaryName: dto.beneficiaryName ?? payment.beneficiaryName ?? undefined,
        accountNumber: dto.accountNumber ?? payment.accountNumber ?? undefined,
        swiftCode: dto.swiftCode ?? payment.swiftCode ?? undefined,
        cardholderName: dto.cardholderName ?? payment.cardholderName ?? undefined,
        cardNumber: dto.cardNumber,
        paymentInstructions: dto.paymentInstructions ?? payment.paymentInstructions ?? undefined,
      }, true);

      const sendToCashier = dto.sendToCashier === true;
      if (sendToCashier) {
        if (!canSendSupplierPaymentToCashier(user)) {
          throw new ForbiddenException('You do not have permission to send payments to cashier');
        }
        if (!intendedAccount) {
          throw new BadRequestException('Intended HQ Finance Account is required');
        }
        if (!recipientFields.recipientName) {
          throw new BadRequestException('Recipient name is required');
        }
        if (approvedAmountKgs > Number(intendedAccount.availableBalance) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
          throw new BadRequestException(
            `Approved amount exceeds available balance on account ${intendedAccount.name}`,
          );
        }
      }

      const oldValue = this.toPaymentResponse(payment);
      const updatedPayment = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : payment.paymentDate,
          amountYuan,
          exchangeRate,
          calculatedAmountKgs,
          approvedAmountKgs,
          amountKgs: approvedAmountKgs,
          kgsAdjustmentReason: adjustment.reason,
          kgsAdjustmentComment: adjustment.comment,
          kgsAdjustedById: adjustment.adjustedById ?? payment.kgsAdjustedById,
          kgsAdjustedAt: adjustment.adjustedAt ?? payment.kgsAdjustedAt,
          paymentMethod,
          ...recipientFields,
          paymentDeadline: dto.paymentDeadline
            ? new Date(dto.paymentDeadline)
            : payment.paymentDeadline,
          intendedFinanceAccountId: intendedAccount?.id ?? null,
          receiptNumber:
            dto.receiptNumber !== undefined ? dto.receiptNumber?.trim() || null : payment.receiptNumber,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : payment.notes,
          accountantComment:
            dto.accountantComment !== undefined
              ? dto.accountantComment?.trim() || null
              : payment.accountantComment,
          accountantId: payment.accountantId ?? user.id,
          status: sendToCashier
            ? ProcurementSupplierPaymentStatus.PENDING_CASHIER
            : payment.status === ProcurementSupplierPaymentStatus.RETURNED
              ? ProcurementSupplierPaymentStatus.DRAFT
              : payment.status,
          sentToCashierAt: sendToCashier ? new Date() : payment.sentToCashierAt,
          executionStatus: sendToCashier ? 'PENDING_EXECUTION' : payment.executionStatus,
          executionStartedAt: sendToCashier ? null : payment.executionStartedAt,
          failureReason: sendToCashier ? null : payment.failureReason,
          cashierId: sendToCashier ? null : payment.cashierId,
          returnReason: sendToCashier ? null : payment.returnReason,
          returnedAt: sendToCashier ? null : payment.returnedAt,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });

      const synced = await this.syncOrderPaymentState(tx, user, order.id, dto.changeReason);
      await this.audit(tx, user, 'PAYMENT_EXCHANGE_RATE_UPDATED', order.id, oldValue, {
        ...this.toPaymentResponse(updatedPayment),
        changeReason: dto.changeReason,
      }, dto.changeReason);

      if (intendedAccount) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_METHOD_DERIVED', order.id, {
          clientPaymentMethod: dto.paymentMethod ?? oldValue.paymentMethod ?? null,
        }, {
          invoiceId: order.id,
          paymentId: updatedPayment.id,
          accountId: intendedAccount.id,
          accountType: intendedAccount.typeCode,
          derivedPaymentMethod: paymentMethod,
          amount: amountYuan,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }

      if (sendToCashier) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', order.id, { status: oldValue.status }, {
          paymentId: updatedPayment.id,
          status: updatedPayment.status,
        });
        await this.notifyPaymentSentToCashier(tx, user, synced.orderNumber, order.id, updatedPayment.id);
      }

      return {
        payment: this.toPaymentResponse(updatedPayment),
        order: synced,
      };
    });
  }

  sendPaymentToCashier(user: AuthUser, orderId: string, paymentId: string) {
    if (!canSendSupplierPaymentToCashier(user)) {
      throw new ForbiddenException('You do not have permission to send payments to cashier');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      if (!EDITABLE_PAYMENT_STATUSES.has(payment.status)) {
        throw new BadRequestException('Only draft or returned payments can be sent to cashier');
      }
      if (!payment.intendedFinanceAccountId) {
        throw new BadRequestException('Intended HQ Finance Account is required');
      }
      if (!payment.recipientName) {
        throw new BadRequestException('Recipient name is required');
      }

      const account = await this.assertHqFinanceAccount(tx, payment.intendedFinanceAccountId);
      const derivedPaymentMethod = resolveSupplierPaymentMethodFromAccountType(account.typeCode);
      this.validateAndBuildRecipientFields(derivedPaymentMethod, {
        recipientName: payment.recipientName ?? undefined,
        recipientCompany: payment.recipientCompany ?? undefined,
        bankName: payment.bankName ?? undefined,
        beneficiaryName: payment.beneficiaryName ?? undefined,
        accountNumber: payment.accountNumber ?? undefined,
        swiftCode: payment.swiftCode ?? undefined,
        cardholderName: payment.cardholderName ?? undefined,
        paymentInstructions: payment.paymentInstructions ?? undefined,
      }, true);

      const approvedAmountKgs = Number(payment.approvedAmountKgs);
      if (approvedAmountKgs > Number(account.availableBalance)) {
        throw new BadRequestException(
          `Approved amount exceeds available balance on account ${account.name}`,
        );
      }

      const updatedPayment = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          paymentMethod: derivedPaymentMethod,
          status: ProcurementSupplierPaymentStatus.PENDING_CASHIER,
          sentToCashierAt: new Date(),
          executionStatus: 'PENDING_EXECUTION',
          executionStartedAt: null,
          failureReason: null,
          cashierId: null,
          accountantId: payment.accountantId ?? user.id,
          returnReason: null,
          returnedAt: null,
          returnedById: null,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });

      if (derivedPaymentMethod !== payment.paymentMethod) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_METHOD_DERIVED', order.id, {
          previousPaymentMethod: payment.paymentMethod,
        }, {
          invoiceId: order.id,
          paymentId: payment.id,
          accountId: account.id,
          accountType: account.typeCode,
          derivedPaymentMethod,
          amount: Number(payment.amountYuan),
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }

      await this.ensureSupplierInvoiceApprovedForCosting(tx, user, order.id);

      const synced = await this.syncOrderPaymentState(tx, user, order.id, 'Payment sent to HQ Cashier');
      await this.audit(tx, user, 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', order.id, {
        status: payment.status,
      }, {
        paymentId: payment.id,
        status: updatedPayment.status,
        executionStatus: 'PENDING_EXECUTION',
        approvedAmountKgs,
        intendedFinanceAccountId: payment.intendedFinanceAccountId,
      });
      await this.notifyPaymentSentToCashier(tx, user, synced.orderNumber, order.id, payment.id);

      return {
        payment: this.toPaymentResponse(updatedPayment),
        order: synced,
      };
    });
  }

  payByAccountant(
    user: AuthUser,
    orderId: string,
    dto: {
      paymentAmountKgs: number;
      financeAccountId: string;
      accountantComment?: string;
      exchangeRateCnyKgs?: number;
      idempotencyKey?: string;
    },
  ) {
    if (!canProcessHqCargoPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant can approve supplier payment instructions');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!order.invoiceSentToAccountantAt) {
        throw new NotFoundException('Supplier invoice request not found');
      }

      const review = String(order.invoiceReviewStatus ?? '').toUpperCase();
      if (review === 'RETURNED') {
        throw new BadRequestException('Счет возвращён на исправление.');
      }
      if (review === 'REJECTED') {
        throw new BadRequestException('Rejected supplier invoice cannot be paid');
      }

      const pendingCashier = await tx.procurementSupplierPayment.findFirst({
        where: {
          procurementOrderId: order.id,
          status: ProcurementSupplierPaymentStatus.PENDING_CASHIER,
        },
      });
      if (pendingCashier) {
        throw new BadRequestException('Счет уже отправлен HQ Cashier.');
      }

      if (dto.idempotencyKey) {
        const prior = await tx.auditLog.findMany({
          where: {
            entity: 'ProcurementOrder',
            entityId: order.id,
            action: {
              in: [
                'SUPPLIER_PAYMENT_SENT_TO_CASHIER',
                'SUPPLIER_PARTIAL_PAYMENT_CREATED',
                'SUPPLIER_PAYMENT_FULLY_PAID',
              ],
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 30,
        });
        const duplicate = prior.find((row) => {
          const meta = row.metadata as { newValue?: { idempotencyKey?: string } } | null;
          return meta?.newValue?.idempotencyKey === dto.idempotencyKey;
        });
        if (duplicate) {
          const existing = await tx.procurementSupplierPayment.findFirst({
            where: { procurementOrderId: order.id },
            orderBy: { createdAt: 'desc' },
            include: PAYMENT_INCLUDE,
          });
          return {
            payment: existing ? this.toPaymentResponse(existing) : null,
            order: await this.getOrderSummary(tx, order.id),
          };
        }
      }

      const payments = await tx.procurementSupplierPayment.findMany({
        where: { procurementOrderId: order.id },
        select: {
          id: true,
          amountYuan: true,
          exchangeRate: true,
          amountKgs: true,
          actualPaidKgs: true,
          approvedAmountKgs: true,
          status: true,
        },
      });
      const summary = summarizeSupplierPayments(
        payments.map((payment) => ({
          amountYuan: Number(payment.amountYuan),
          exchangeRate: Number(payment.exchangeRate),
          amountKgs: Number(payment.amountKgs),
          actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
          approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
          status: payment.status,
        })),
        Number(order.totalYuan),
        {
          invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
          previousStatus: order.supplierPaymentStatus,
        },
      );

      const ledgerStatus = String(summary.supplierPaymentStatus).toUpperCase();
      if (ledgerStatus === 'PAID' || ledgerStatus === 'OVERPAID') {
        throw new BadRequestException('Этот счёт уже полностью оплачен.');
      }
      if (
        !SUPPLIER_ACCOUNTANT_PAYABLE.has(ledgerStatus) &&
        ledgerStatus !== ProcurementSupplierPaymentLedgerStatus.AWAITING_CASHIER
      ) {
        throw new BadRequestException('Счет ещё не одобрен для обработки.');
      }

      let authoritativeRate: number;
      let shouldPersistRate = false;
      try {
        const resolved = resolveSupplierPaymentExchangeRate({
          defaultYuanRate: Number(order.defaultYuanRate || 0) || null,
          submittedRate: dto.exchangeRateCnyKgs,
          payments: payments.map((payment) => ({
            exchangeRate: Number(payment.exchangeRate || 0) || null,
            status: payment.status,
          })),
        });
        authoritativeRate = resolved.rate;
        shouldPersistRate = resolved.shouldPersist;
      } catch {
        throw new BadRequestException(SUPPLIER_CNY_RATE_REQUIRED_MESSAGE);
      }

      const approvedYuan = resolveApprovedSupplierCostBaseYuan({
        totalYuan: Number(order.totalYuan),
        requestedPaymentYuan:
          order.requestedPaymentYuan != null ? Number(order.requestedPaymentYuan) : null,
      });
      const approvedAmountKgs = calculateApprovedSupplierKgsFromRate(approvedYuan, authoritativeRate);
      const alreadyPaidKgs = summary.totalPaidKgs;
      const remainingKgs = roundMoney(Math.max(approvedAmountKgs - alreadyPaidKgs, 0));
      if (!(remainingKgs > 0)) {
        throw new BadRequestException('Этот счёт уже полностью оплачен.');
      }

      const instructionAmountKgs = roundMoney(dto.paymentAmountKgs);
      if (!(instructionAmountKgs > 0)) {
        throw new BadRequestException('Сумма платежа должна быть больше нуля.');
      }
      if (instructionAmountKgs > remainingKgs + 0.009) {
        throw new BadRequestException('Сумма частичного платежа превышает остаток.');
      }

      const amountYuan = roundMoney(instructionAmountKgs / authoritativeRate);
      if (!(amountYuan > 0)) {
        throw new BadRequestException('Payment CNY amount must be greater than zero');
      }

      const account = await this.assertHqFinanceAccount(tx, dto.financeAccountId);
      const paymentMethod = resolveSupplierPaymentMethodFromAccountType(account.typeCode);

      const paymentInfo = await tx.procurementPaymentInfoVersion.findFirst({
        where: { procurementOrderId: order.id, isActive: true },
      });
      const supplier = order.supplierId
        ? await tx.supplier.findFirst({
            where: { id: order.supplierId },
            select: { name: true },
          })
        : null;
      const recipientFields = this.validateAndBuildRecipientFields(paymentMethod, {
        recipientName: paymentInfo?.accountHolder ?? supplier?.name ?? undefined,
        bankName: paymentInfo?.bankName ?? undefined,
        beneficiaryName: paymentInfo?.accountHolder ?? undefined,
        accountNumber: paymentInfo?.accountNumber ?? undefined,
        swiftCode: paymentInfo?.swiftCode ?? undefined,
        paymentInstructions:
          paymentInfo?.comment ??
          (paymentInfo?.bankAddress ? `Bank address: ${paymentInfo.bankAddress}` : undefined),
      }, true);
      if (!recipientFields.recipientName) {
        throw new BadRequestException('Recipient name is required before sending to cashier');
      }

      await this.assertYuanAllocationAllowed(tx, user, order, amountYuan, false);

      const isFirstApproval =
        ledgerStatus === ProcurementSupplierPaymentLedgerStatus.AWAITING_ACCOUNTANT ||
        ledgerStatus === ProcurementSupplierPaymentLedgerStatus.UNPAID ||
        review === 'UNDER_REVIEW' ||
        review === 'SUBMITTED' ||
        review === 'APPROVED' ||
        ledgerStatus === ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED;

      if (isFirstApproval) {
        await this.ensureSupplierInvoiceApprovedForCosting(tx, user, order.id);
      }

      if (shouldPersistRate) {
        await tx.procurementOrder.update({
          where: { id: order.id },
          data: { defaultYuanRate: authoritativeRate },
        });
        try {
          await this.landedCostService.recalculateProcurementOrder(
            order.id,
            {
              user,
              reason: 'Supplier payment exchange rate locked by HQ Accountant',
              triggerReason: 'supplier-payment-rate-locked',
            },
            tx,
          );
        } catch {
          // Weight/finalized gates may block recalculation.
        }
      }

      const sequenceNumber = await this.nextSequenceNumber(tx, order.id);
      const payment = await tx.procurementSupplierPayment.create({
        data: {
          procurementOrderId: order.id,
          supplierId: order.supplierId,
          paymentInfoVersionId: paymentInfo?.id ?? null,
          sequenceNumber,
          paymentDate: new Date(),
          amountYuan,
          exchangeRate: authoritativeRate,
          calculatedAmountKgs: instructionAmountKgs,
          approvedAmountKgs: instructionAmountKgs,
          amountKgs: instructionAmountKgs,
          paymentMethod,
          ...recipientFields,
          intendedFinanceAccountId: account.id,
          accountantComment: dto.accountantComment?.trim() || null,
          status: ProcurementSupplierPaymentStatus.PENDING_CASHIER,
          sentToCashierAt: new Date(),
          executionStatus: 'PENDING_EXECUTION',
          executionStartedAt: null,
          failureReason: null,
          accountantId: user.id,
          createdById: user.id,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
        },
        include: PAYMENT_INCLUDE,
      });

      const synced = await this.syncOrderPaymentState(tx, user, order.id, 'Supplier payment sent to HQ Cashier');
      const isPartialInstruction = instructionAmountKgs + 0.009 < remainingKgs;
      const auditPayload = {
        supplierPaymentId: payment.id,
        invoiceId: order.id,
        procurementOrderId: order.id,
        action: isPartialInstruction ? 'PARTIAL' : 'FULL',
        approvedAmount: approvedAmountKgs,
        paymentAmount: instructionAmountKgs,
        paidAmount: alreadyPaidKgs,
        remainingAmount: remainingKgs,
        previousStatus: order.supplierPaymentStatus,
        newStatus: synced.supplierPaymentStatus,
        accountId: account.id,
        paymentMethod,
        actorUserId: user.id,
        timestamp: new Date().toISOString(),
        idempotencyKey: dto.idempotencyKey ?? null,
      };

      if (isPartialInstruction) {
        await this.audit(tx, user, 'SUPPLIER_PARTIAL_PAYMENT_CREATED', order.id, {
          supplierPaymentStatus: order.supplierPaymentStatus,
          paidAmountKgs: alreadyPaidKgs,
        }, auditPayload);
      } else {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_FULLY_PAID', order.id, {
          supplierPaymentStatus: order.supplierPaymentStatus,
          paidAmountKgs: alreadyPaidKgs,
        }, auditPayload);
      }

      await this.audit(tx, user, 'SUPPLIER_PAYMENT_SENT_TO_CASHIER', order.id, {
        supplierPaymentStatus: order.supplierPaymentStatus,
      }, {
        paymentId: payment.id,
        sequenceNumber,
        approvedAmountKgs: instructionAmountKgs,
        ...auditPayload,
      });

      if (paymentMethod) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_METHOD_DERIVED', order.id, null, {
          invoiceId: order.id,
          paymentId: payment.id,
          accountId: account.id,
          accountType: account.typeCode,
          derivedPaymentMethod: paymentMethod,
          amount: amountYuan,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }

      await this.notifyPaymentSentToCashier(tx, user, synced.orderNumber, order.id, payment.id);

      return {
        payment: this.toPaymentResponse(payment),
        order: synced,
      };
    });
  }

  returnForCorrectionByAccountant(
    user: AuthUser,
    orderId: string,
    dto: { reason: string; comment?: string; idempotencyKey?: string },
  ) {
    if (!canProcessHqCargoPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant can return supplier invoices for correction');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (!order.invoiceSentToAccountantAt) {
        throw new NotFoundException('Supplier invoice request not found');
      }

      const payments = await tx.procurementSupplierPayment.findMany({
        where: { procurementOrderId: order.id },
        select: { id: true, status: true, amountKgs: true, actualPaidKgs: true, approvedAmountKgs: true },
      });
      const paidKgs = roundMoney(
        payments
          .filter((payment) => isConfirmedSupplierPayment(payment.status))
          .reduce(
            (sum, payment) =>
              sum +
              resolveSupplierPaymentKgs({
                amountKgs: Number(payment.amountKgs),
                actualPaidKgs:
                  payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
                approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
              }),
            0,
          ),
      );
      if (paidKgs > 0.009) {
        throw new BadRequestException(SUPPLIER_RETURN_BLOCKED_MESSAGE);
      }

      const ledgerCount = await tx.financeLedgerEntry.count({
        where: {
          referenceType: 'ProcurementSupplierPayment',
          referenceId: { in: payments.map((payment) => payment.id) },
          entryType: FinanceLedgerEntryType.EXPENSE,
        },
      });
      if (ledgerCount > 0) {
        throw new BadRequestException(SUPPLIER_RETURN_BLOCKED_MESSAGE);
      }

      if (dto.idempotencyKey) {
        const prior = await tx.auditLog.findMany({
          where: {
            entity: 'ProcurementOrder',
            entityId: order.id,
            action: 'SUPPLIER_PAYMENT_RETURNED_FOR_CORRECTION',
          },
          orderBy: { timestamp: 'desc' },
          take: 20,
        });
        const duplicate = prior.find((row) => {
          const meta = row.metadata as { newValue?: { idempotencyKey?: string } } | null;
          return meta?.newValue?.idempotencyKey === dto.idempotencyKey;
        });
        if (duplicate) {
          return { id: order.id, source: 'SUPPLIER_INVOICE', status: 'RETURNED', reason: dto.reason };
        }
      }

      const review = String(order.invoiceReviewStatus ?? '').toUpperCase();
      if (review === 'RETURNED') {
        return { id: order.id, source: 'SUPPLIER_INVOICE', status: 'RETURNED', reason: dto.reason };
      }

      const reason = dto.reason.trim();
      const comment = dto.comment?.trim() || '';
      const combinedReason = comment ? `${reason}\n${comment}` : reason;

      await tx.procurementSupplierPayment.updateMany({
        where: {
          procurementOrderId: order.id,
          status: {
            in: [
              ProcurementSupplierPaymentStatus.PENDING_CASHIER,
              ProcurementSupplierPaymentStatus.DRAFT,
            ],
          },
        },
        data: {
          status: ProcurementSupplierPaymentStatus.CANCELLED,
          executionStatus: null,
          sentToCashierAt: null,
        },
      });

      const updated = await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          invoiceReviewStatus: 'RETURNED',
          invoiceReturnReason: combinedReason,
          invoiceRejectReason: null,
          invoiceReviewedAt: new Date(),
          invoiceReviewedById: user.id,
          supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus.AWAITING_ACCOUNTANT,
          expectedPaymentDate: null,
          paymentPostponeComment: null,
        },
      });

      await this.audit(tx, user, 'PAYABLE_REQUEST_RETURNED', order.id, {
        invoiceReviewStatus: order.invoiceReviewStatus,
      }, { invoiceReviewStatus: 'RETURNED', reason: combinedReason });

      const approvedYuan = resolveApprovedSupplierCostBaseYuan({
        totalYuan: Number(order.totalYuan),
        requestedPaymentYuan:
          order.requestedPaymentYuan != null ? Number(order.requestedPaymentYuan) : null,
      });
      await this.audit(tx, user, 'SUPPLIER_PAYMENT_RETURNED_FOR_CORRECTION', order.id, {
        invoiceReviewStatus: order.invoiceReviewStatus,
        supplierPaymentStatus: order.supplierPaymentStatus,
      }, {
        supplierPaymentId: null,
        invoiceId: order.id,
        procurementOrderId: order.id,
        action: 'RETURN',
        approvedAmount: approvedYuan,
        paymentAmount: 0,
        paidAmount: paidKgs,
        remainingAmount: approvedYuan,
        previousStatus: order.supplierPaymentStatus,
        newStatus: ProcurementSupplierPaymentLedgerStatus.AWAITING_ACCOUNTANT,
        correctionReason: reason,
        actorUserId: user.id,
        timestamp: new Date().toISOString(),
        idempotencyKey: dto.idempotencyKey ?? null,
      });

      try {
        await this.landedCostService.recalculateProcurementOrder(
          order.id,
          { user, reason: combinedReason, triggerReason: 'supplier-returned-for-correction' },
          tx,
        );
      } catch {
        // Weight/finalized gates may block recalculation.
      }

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_RETURNED,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: order.orderNumber,
        message: `Supplier invoice for ${order.orderNumber} returned for correction: ${reason}`,
        recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER],
      });

      return { id: updated.id, source: 'SUPPLIER_INVOICE', status: 'RETURNED', reason: combinedReason };
    });
  }

  returnPaymentToAccountant(
    user: AuthUser,
    orderId: string,
    paymentId: string,
    dto: ReturnSupplierPaymentDto,
  ) {
    if (!canReturnSupplierPaymentToAccountant(user)) {
      throw new ForbiddenException('You do not have permission to return payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      if (payment.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER) {
        throw new BadRequestException('Only payments awaiting cashier can be returned');
      }
      const reason = dto.reason.trim();
      if (reason.length < 3) {
        throw new BadRequestException('Return reason is required');
      }

      const updatedPayment = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          status: ProcurementSupplierPaymentStatus.RETURNED,
          executionStatus: 'RETURNED_TO_ACCOUNTANT',
          returnReason: reason,
          returnedAt: new Date(),
          returnedById: user.id,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });

      const synced = await this.syncOrderPaymentState(tx, user, order.id, reason);
      await this.audit(tx, user, 'SUPPLIER_PAYMENT_RETURNED_TO_ACCOUNTANT', order.id, {
        status: payment.status,
      }, {
        paymentId: payment.id,
        status: updatedPayment.status,
        reason,
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SUPPLIER_PAYMENT_RETURNED_TO_ACCOUNTANT,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: synced.orderNumber,
        message: `Payment #${payment.sequenceNumber} for ${synced.orderNumber} was returned to HQ Accountant: ${reason}`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.SUPPLY_CHAIN_MANAGER],
      });

      return {
        payment: this.toPaymentResponse(updatedPayment),
        order: synced,
      };
    });
  }

  confirmPayment(user: AuthUser, orderId: string, paymentId: string, dto: ConfirmSupplierPaymentDto) {
    if (!canConfirmSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to confirm supplier payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);

      if (payment.status === ProcurementSupplierPaymentStatus.ACTIVE) {
        throw new ConflictException('Payment is already completed');
      }
      if (payment.status !== ProcurementSupplierPaymentStatus.PENDING_CASHIER) {
        throw new BadRequestException('Payment is not awaiting cashier confirmation');
      }
      if (dto.expectedVersion != null && dto.expectedVersion !== payment.version) {
        throw new ConflictException('Payment was updated by another user; refresh and retry');
      }

      const receiptCount = await tx.fileAttachment.count({
        where: {
          supplierPaymentId: payment.id,
          deletedAt: null,
          entityType: FileAttachmentEntityType.SUPPLIER_PAYMENT,
        },
      });
      if (receiptCount <= 0) {
        throw new BadRequestException('Payment receipt attachment is required');
      }

      const actualPaidKgs = roundMoney(dto.actualPaidKgs);
      if (actualPaidKgs <= 0) {
        throw new BadRequestException('Actual paid amount must be greater than zero');
      }

      const approvedAmountKgs = Number(payment.approvedAmountKgs);
      if (actualPaidKgs > approvedAmountKgs + 0.009) {
        await this.notificationsService.notifyInTx(tx, user, {
          type: AlertType.SUPPLIER_PAYMENT_OVERPAYMENT_ATTEMPT,
          entityType: 'ProcurementOrder',
          entityId: order.id,
          referenceNumber: order.orderNumber,
          message: `Overpayment attempt on ${order.orderNumber} payment #${payment.sequenceNumber}: ${actualPaidKgs} > ${approvedAmountKgs}`,
          recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER],
        });
        throw new BadRequestException('Actual paid amount cannot exceed accountant-approved amount');
      }

      const difference = roundMoney(actualPaidKgs - approvedAmountKgs);
      if (Math.abs(difference) > 0.009 && (!dto.actualPaidDifferenceReason || dto.actualPaidDifferenceReason.trim().length < 3)) {
        throw new BadRequestException('Reason is required when actual paid amount differs from approved amount');
      }

      const financeAccountId = dto.financeAccountId || payment.intendedFinanceAccountId;
      if (!financeAccountId) {
        throw new BadRequestException('Finance account is required');
      }
      if (
        payment.intendedFinanceAccountId &&
        financeAccountId !== payment.intendedFinanceAccountId
      ) {
        if (!canChangeSupplierPaymentFinanceAccount(user)) {
          throw new ForbiddenException('Changing the finance account requires Finance Manager or CEO permission');
        }
        if (!dto.accountChangeReason || dto.accountChangeReason.trim().length < 3) {
          throw new BadRequestException('Account change reason is required');
        }
      }

      const account = await this.assertHqFinanceAccount(tx, financeAccountId, true);
      await assertHqCashierAssignedAccount(this.prisma, user, account.id);
      if (actualPaidKgs > Number(account.availableBalance) + 0.009) {
        throw new BadRequestException('Insufficient HQ Finance Account balance');
      }

      // Re-validate remaining CNY against other completed payments
      const otherPayments = await tx.procurementSupplierPayment.findMany({
        where: { procurementOrderId: order.id, NOT: { id: payment.id } },
      });
      const paidYuan = otherPayments
        .filter((row) => isConfirmedSupplierPayment(row.status))
        .reduce((sum, row) => sum + Number(row.amountYuan), 0);
      if (roundMoney(paidYuan + Number(payment.amountYuan)) > Number(order.totalYuan) + 0.009) {
        throw new BadRequestException('Payment would exceed remaining unpaid CNY amount');
      }

      const ledgerEntry = await this.financeLedgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: null,
        entryType: FinanceLedgerEntryType.EXPENSE,
        amount: actualPaidKgs,
        currency: account.currency,
        referenceType: 'ProcurementSupplierPayment',
        referenceId: payment.id,
        notes: `China purchase ${order.orderNumber} payment #${payment.sequenceNumber}`,
      });

      const updatedPayment = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          status: ProcurementSupplierPaymentStatus.ACTIVE,
          executionStatus: 'COMPLETED',
          actualPaidKgs,
          amountKgs: actualPaidKgs,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          paidAt: new Date(),
          actualFinanceAccountId: account.id,
          accountChangeReason: dto.accountChangeReason?.trim() || null,
          transactionNumber: dto.transactionNumber?.trim() || null,
          cashierComment: dto.cashierComment?.trim() || null,
          actualPaidDifferenceReason: dto.actualPaidDifferenceReason?.trim() || null,
          cashierId: user.id,
          ledgerEntryId: ledgerEntry.id,
          failureReason: null,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });

      const previousStatus = order.supplierPaymentStatus;
      const synced = await this.syncOrderPaymentState(tx, user, order.id, 'Supplier payment completed by cashier');

      await this.audit(tx, user, 'SUPPLIER_PAYMENT_CASHIER_COMPLETED', order.id, {
        status: payment.status,
        approvedAmountKgs,
      }, {
        paymentId: payment.id,
        status: updatedPayment.status,
        actualPaidKgs,
        difference,
        financeAccountId: account.id,
        ledgerEntryId: ledgerEntry.id,
        beforeBalance: Number(ledgerEntry.beforeBalance),
        afterBalance: Number(ledgerEntry.afterBalance),
      });

      if (Math.abs(difference) > 0.009) {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_ACTUAL_AMOUNT_DIFFERENCE', order.id, {
          approvedAmountKgs,
        }, {
          actualPaidKgs,
          difference,
          reason: dto.actualPaidDifferenceReason,
        });
      }

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SUPPLIER_PAYMENT_COMPLETED,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: synced.orderNumber,
        message: `Payment #${payment.sequenceNumber} for ${synced.orderNumber} completed. Paid ${actualPaidKgs} KGS.`,
        recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER],
      });

      const creatorUserId = resolveInvoiceCreatorUserId({
        orderCreatedById: order.createdById,
        invoiceSentById: order.invoiceSentById,
        paymentCreatedById: payment.createdById,
      });
      const receiptDelivery = await deliverReceiptsToCreatorInTx(tx, this.notificationsService, user, {
        source: 'SUPPLIER_PAYMENT',
        invoiceId: order.id,
        paymentId: payment.id,
        invoiceNumber: synced.orderNumber,
        invoiceStatus: updatedPayment.status,
        processedAt: updatedPayment.paidAt ?? new Date(),
        creatorUserId,
        notificationEntityType: 'ProcurementOrder',
        notificationEntityId: order.id,
        module: NotificationModule.SUPPLIER_PAYMENT,
        paymentAmount: actualPaidKgs,
        paymentCurrency: 'KGS',
        paymentMethod: updatedPayment.paymentMethod,
        isPartialPayment:
          synced.supplierPaymentStatus === 'PARTIALLY_PAID' ||
          previousStatus === 'PARTIALLY_PAID',
        isFullyPaid:
          synced.supplierPaymentStatus === 'PAID' || synced.supplierPaymentStatus === 'OVERPAID',
      });

      if (
        previousStatus !== 'PARTIALLY_PAID' &&
        synced.supplierPaymentStatus === 'PARTIALLY_PAID'
      ) {
        await this.notificationsService.notifyInTx(tx, user, {
          type: AlertType.SUPPLIER_PAYMENT_PARTIALLY_PAID,
          entityType: 'ProcurementOrder',
          entityId: order.id,
          referenceNumber: synced.orderNumber,
          message: `Procurement ${synced.orderNumber} is partially paid. Remaining ${synced.remainingYuan} CNY.`,
          recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
        });
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_PARTIALLY_PAID', order.id, { previousStatus }, {
          supplierPaymentStatus: synced.supplierPaymentStatus,
          remainingYuan: synced.remainingYuan,
        });
        await this.audit(tx, user, 'SUPPLIER_PARTIAL_PAYMENT', order.id, { previousStatus }, {
          procurementOrderId: order.id,
          supplierInvoiceId: order.id,
          paymentStatus: synced.supplierPaymentStatus,
          paidAmount: synced.totalPaidYuan,
          remainingAmount: synced.remainingYuan,
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }

      if (synced.supplierPaymentStatus === 'PAID' || synced.supplierPaymentStatus === 'OVERPAID') {
        await this.audit(tx, user, 'SUPPLIER_PAYMENT_FULLY_PAID', order.id, { previousStatus }, {
          supplierPaymentStatus: synced.supplierPaymentStatus,
          totalPaidYuan: synced.totalPaidYuan,
          totalPaidKgs: synced.totalPaidKgs,
        });
      }

      return {
        payment: this.toPaymentResponse(updatedPayment),
        order: synced,
        receiptAttachment: receiptDelivery.receiptAttachments[0] ?? null,
        receiptAttachments: receiptDelivery.receiptAttachments,
        creatorNotification: receiptDelivery.creatorNotification,
      };
    });
  }

  voidPayment(user: AuthUser, orderId: string, paymentId: string, dto: VoidSupplierPaymentDto) {
    if (!canVoidSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to void supplier payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      if (payment.status === ProcurementSupplierPaymentStatus.VOID) {
        throw new BadRequestException('Payment is already voided');
      }
      if (payment.status === ProcurementSupplierPaymentStatus.ACTIVE) {
        throw new BadRequestException('Completed payments cannot be voided; use reversal');
      }
      if (payment.status === ProcurementSupplierPaymentStatus.REVERSED) {
        throw new BadRequestException('Reversed payments cannot be voided');
      }

      const oldValue = this.toPaymentResponse(payment);
      const voided = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          status: ProcurementSupplierPaymentStatus.VOID,
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: dto.reason?.trim() || null,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });
      const synced = await this.syncOrderPaymentState(tx, user, order.id, dto.reason?.trim() || 'Payment voided');
      await this.audit(tx, user, 'SUPPLIER_PAYMENT_VOIDED', order.id, oldValue, this.toPaymentResponse(voided), dto.reason);
      return { payment: this.toPaymentResponse(voided), order: synced };
    });
  }

  reversePayment(user: AuthUser, orderId: string, paymentId: string, dto: ReverseSupplierPaymentDto) {
    if (!canReverseSupplierPayment(user)) {
      throw new ForbiddenException('You do not have permission to reverse supplier payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      if (payment.status !== ProcurementSupplierPaymentStatus.ACTIVE) {
        throw new BadRequestException('Only completed payments can be reversed');
      }
      if (!payment.ledgerEntryId || !payment.actualFinanceAccountId) {
        throw new BadRequestException('Completed payment is missing ledger linkage; cannot reverse safely');
      }

      const reason = dto.reason.trim();
      const restoreAmount = resolveSupplierPaymentKgs({
        amountKgs: Number(payment.amountKgs),
        actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
        approvedAmountKgs: Number(payment.approvedAmountKgs),
        amountYuan: Number(payment.amountYuan),
        exchangeRate: Number(payment.exchangeRate),
      });
      const account = await this.assertHqFinanceAccount(tx, payment.actualFinanceAccountId, true);

      const reversalEntry = await this.financeLedgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: null,
        entryType: FinanceLedgerEntryType.ADJUSTMENT,
        amount: restoreAmount,
        currency: account.currency,
        referenceType: 'ProcurementSupplierPaymentReversal',
        referenceId: payment.id,
        notes: `Reversal of China purchase ${order.orderNumber} payment #${payment.sequenceNumber}: ${reason}`,
      });

      const reversed = await tx.procurementSupplierPayment.update({
        where: { id: payment.id },
        data: {
          status: ProcurementSupplierPaymentStatus.REVERSED,
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: reason,
          version: { increment: 1 },
        },
        include: PAYMENT_INCLUDE,
      });

      const synced = await this.syncOrderPaymentState(tx, user, order.id, reason);
      await this.audit(tx, user, 'SUPPLIER_PAYMENT_REVERSED', order.id, {
        paymentId: payment.id,
        status: ProcurementSupplierPaymentStatus.ACTIVE,
        actualPaidKgs: payment.actualPaidKgs,
        ledgerEntryId: payment.ledgerEntryId,
      }, {
        paymentId: payment.id,
        status: ProcurementSupplierPaymentStatus.REVERSED,
        restoredAmountKgs: restoreAmount,
        reversalLedgerEntryId: reversalEntry.id,
        reason,
      }, reason);

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SUPPLIER_PAYMENT_REVERSAL_REQUESTED,
        entityType: 'ProcurementOrder',
        entityId: order.id,
        referenceNumber: synced.orderNumber,
        message: `Payment #${payment.sequenceNumber} for ${synced.orderNumber} was reversed. ${restoreAmount} KGS restored.`,
        recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT, Role.SUPPLY_CHAIN_MANAGER],
      });

      return {
        payment: this.toPaymentResponse(reversed),
        order: synced,
        reversalLedgerEntryId: reversalEntry.id,
      };
    });
  }

  permanentlyDeletePayment(
    user: AuthUser,
    orderId: string,
    paymentId: string,
    dto: PermanentDeleteHqPaymentDto,
  ) {
    if (!canPermanentDeleteBusinessData(user)) {
      throw new ForbiddenException('Only HQ SysAdmin can permanently delete payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      const payment = await this.lockPayment(tx, order.id, paymentId);
      const oldInvoiceStatus = order.supplierPaymentStatus ?? null;
      const paymentNumber = `PAY-${payment.sequenceNumber}`;
      const paymentDate =
        payment.paidAt?.toISOString() ??
        payment.paymentDate?.toISOString() ??
        payment.sentToCashierAt?.toISOString() ??
        null;
      const accountId = payment.actualFinanceAccountId ?? payment.intendedFinanceAccountId ?? null;

      if (payment.status === ProcurementSupplierPaymentStatus.ACTIVE) {
        await this.assertNoIrreversibleWarehouseOps(tx, order.id);
        if (!payment.ledgerEntryId || !payment.actualFinanceAccountId) {
          throw new BadRequestException('Completed payment is missing ledger linkage; cannot delete safely');
        }
        const reason = dto.reason?.trim() || 'Permanent delete by HQ SysAdmin';
        const restoreAmount = resolveSupplierPaymentKgs({
          amountKgs: Number(payment.amountKgs),
          actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
          approvedAmountKgs: Number(payment.approvedAmountKgs),
          amountYuan: Number(payment.amountYuan),
          exchangeRate: Number(payment.exchangeRate),
        });
        const account = await this.assertHqFinanceAccount(tx, payment.actualFinanceAccountId, true);
        await this.financeLedgerService.postLedgerEntry(tx, user, {
          accountId: account.id,
          branchId: null,
          entryType: FinanceLedgerEntryType.ADJUSTMENT,
          amount: restoreAmount,
          currency: account.currency,
          referenceType: 'ProcurementSupplierPaymentPermanentDeleteReversal',
          referenceId: payment.id,
          notes: `Permanent delete reversal China purchase ${order.orderNumber} payment #${payment.sequenceNumber}: ${reason}`,
        });
      } else if (payment.status === ProcurementSupplierPaymentStatus.REVERSED) {
        // Ledger already reversed — do not post a second adjustment.
      } else if (
        payment.status === ProcurementSupplierPaymentStatus.VOID ||
        payment.status === ProcurementSupplierPaymentStatus.CANCELLED
      ) {
        // No ledger impact.
      } else {
        // DRAFT, PENDING_CASHIER, RETURNED — no ledger entries yet.
      }

      await tx.fileAttachment.updateMany({
        where: {
          entityId: payment.id,
          deletedAt: null,
          entityType: FileAttachmentEntityType.SUPPLIER_PAYMENT,
        },
        data: { deletedAt: new Date() },
      });

      await tx.procurementSupplierPayment.delete({ where: { id: payment.id } });

      const synced = await this.syncOrderPaymentState(
        tx,
        user,
        order.id,
        dto.reason?.trim() || 'Supplier payment permanently deleted',
      );

      await auditPaymentPermanentlyDeleted(tx, user, {
        paymentId: payment.id,
        paymentType: 'ProcurementSupplierPayment',
        paymentNumber,
        amount: Number(payment.amountYuan),
        currency: 'CNY',
        paymentDate,
        accountId,
        cashboxId: accountId,
        invoiceId: order.id,
        oldInvoiceStatus,
        newInvoiceStatus: synced.supplierPaymentStatus ?? null,
        reason: dto.reason,
      });

      return {
        success: true,
        deletedPaymentId: payment.id,
        paymentNumber,
        order: synced,
      };
    });
  }

  toPaymentResponse(payment: any) {
    return {
      ...payment,
      sequenceNumber: Number(payment.sequenceNumber ?? 1),
      amountYuan: Number(payment.amountYuan),
      exchangeRate: Number(payment.exchangeRate),
      calculatedAmountKgs: Number(payment.calculatedAmountKgs ?? payment.amountKgs ?? 0),
      approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs ?? 0),
      actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
      amountKgs: Number(payment.amountKgs),
      version: Number(payment.version ?? 1),
      intendedFinanceAccount: payment.intendedFinanceAccount
        ? {
            ...payment.intendedFinanceAccount,
            currentBalance: Number(payment.intendedFinanceAccount.currentBalance),
            availableBalance: Number(payment.intendedFinanceAccount.availableBalance),
          }
        : payment.intendedFinanceAccount,
      actualFinanceAccount: payment.actualFinanceAccount
        ? {
            ...payment.actualFinanceAccount,
            currentBalance: Number(payment.actualFinanceAccount.currentBalance),
            availableBalance: Number(payment.actualFinanceAccount.availableBalance),
          }
        : payment.actualFinanceAccount,
    };
  }

  private toOrderPaymentSummary(order: any) {
    const summary = summarizeSupplierPayments(
      (order.supplierPayments ?? []).map((payment: any) => ({
        amountYuan: Number(payment.amountYuan),
        exchangeRate: Number(payment.exchangeRate),
        amountKgs: Number(payment.amountKgs),
        actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
        approvedAmountKgs: payment.approvedAmountKgs != null ? Number(payment.approvedAmountKgs) : null,
        status: payment.status,
      })),
      Number(order.totalYuan),
      {
        invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
        previousStatus: order.supplierPaymentStatus,
      },
    );
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      supplier: order.supplier,
      purchaseDate: order.purchaseDate,
      totalYuan: Number(order.totalYuan),
      totalPaidYuan: summary.totalPaidYuan,
      totalPaidKgs: summary.totalPaidKgs,
      remainingYuan: summary.remainingYuan,
      weightedAverageYuanRate: summary.weightedAverageYuanRate,
      supplierPaymentStatus: summary.supplierPaymentStatus,
      completedPaymentCount: summary.completedPaymentCount,
      pendingCashierCount: summary.pendingCashierCount,
      requestedPaymentYuan:
        order.requestedPaymentYuan != null ? Number(order.requestedPaymentYuan) : null,
      supplierInvoiceNumber: order.supplierInvoiceNumber,
      expectedPaymentDate: order.expectedPaymentDate,
      invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
      invoiceSentBy: order.invoiceSentBy,
      note: order.note,
      supplierPayments: (order.supplierPayments ?? []).map((payment: any) => this.toPaymentResponse(payment)),
    };
  }

  private async getOrderSummary(tx: Tx, orderId: string) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        supplier: { select: { id: true, name: true } },
        invoiceSentBy: { select: { id: true, fullName: true } },
        supplierPayments: { include: PAYMENT_INCLUDE, orderBy: { sequenceNumber: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return this.toOrderPaymentSummary(order);
  }

  private async ensureSupplierInvoiceApprovedForCosting(tx: Tx, user: AuthUser, orderId: string) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, invoiceReviewStatus: true },
    });
    if (!order) return;
    const review = String(order.invoiceReviewStatus ?? '').toUpperCase();
    if (review === 'APPROVED' || review === 'REJECTED') return;
    await tx.procurementOrder.update({
      where: { id: orderId },
      data: {
        invoiceReviewStatus: 'APPROVED',
        invoiceReviewedAt: new Date(),
        invoiceReviewedById: user.id,
        invoiceReturnReason: null,
        invoiceRejectReason: null,
      },
    });
    await this.audit(tx, user, 'PAYABLE_REQUEST_APPROVED', orderId, {
      invoiceReviewStatus: order.invoiceReviewStatus,
    }, { invoiceReviewStatus: 'APPROVED', reason: 'Auto-approved when accountant processed supplier payment' });
  }

  private async syncOrderPaymentState(tx: Tx, user: AuthUser, orderId: string, reason: string) {
    const order = await tx.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { supplierPayments: true, supplier: { select: { id: true, name: true } } },
    });
    if (!order) throw new NotFoundException('Procurement order not found');

    const summary = summarizeSupplierPayments(
      order.supplierPayments.map((payment) => ({
        amountYuan: Number(payment.amountYuan),
        exchangeRate: Number(payment.exchangeRate),
        amountKgs: Number(payment.amountKgs),
        actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
        approvedAmountKgs: Number(payment.approvedAmountKgs ?? payment.amountKgs),
        status: payment.status,
      })),
      Number(order.totalYuan),
      {
        invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
        previousStatus: order.supplierPaymentStatus,
      },
    );

    const fullyPaid =
      summary.supplierPaymentStatus === 'PAID' || summary.supplierPaymentStatus === 'OVERPAID';
    const canAdvanceOrderStatusToPaid = (
      [
        ProcurementOrderStatus.DRAFT,
        ProcurementOrderStatus.APPROVED,
        ProcurementOrderStatus.ORDERED,
        ProcurementOrderStatus.SENT_TO_SUPPLIER,
      ] as string[]
    ).includes(order.status);

    const updated = await tx.procurementOrder.update({
      where: { id: order.id },
      data: {
        totalPaidYuan: summary.totalPaidYuan,
        totalPaidKgs: summary.totalPaidKgs,
        remainingYuan: summary.remainingYuan,
        weightedAverageYuanRate: summary.weightedAverageYuanRate,
        supplierPaymentStatus: summary.supplierPaymentStatus,
        ...(fullyPaid && canAdvanceOrderStatusToPaid
          ? { status: ProcurementOrderStatus.PAID }
          : {}),
        paidAt: fullyPaid ? order.paidAt ?? new Date() : order.paidAt,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        invoiceSentBy: { select: { id: true, fullName: true } },
        supplierPayments: { include: PAYMENT_INCLUDE, orderBy: { sequenceNumber: 'asc' } },
      },
    });

    if (fullyPaid && canAdvanceOrderStatusToPaid && order.status !== ProcurementOrderStatus.PAID) {
      await this.audit(tx, user, 'PROCUREMENT_STATUS_CHANGE', order.id, {
        status: order.status,
      }, {
        status: ProcurementOrderStatus.PAID,
        reason: 'Set automatically after supplier payment confirmation',
      }, reason);
    }

    await this.audit(tx, user, 'SUPPLIER_PAYMENT_TOTALS_RECALCULATED', order.id, {
      totalPaidYuan: Number(order.totalPaidYuan ?? 0),
      remainingYuan: Number(order.remainingYuan ?? 0),
      supplierPaymentStatus: order.supplierPaymentStatus,
    }, {
      totalPaidYuan: summary.totalPaidYuan,
      totalPaidKgs: summary.totalPaidKgs,
      remainingYuan: summary.remainingYuan,
      weightedAverageYuanRate: summary.weightedAverageYuanRate,
      supplierPaymentStatus: summary.supplierPaymentStatus,
      reason,
    }, reason);

    // Recalculate product/landed cost from the FULL procurement CNY amount
    // (estimated rate before payments; weighted paid rate thereafter).
    const triggerReason =
      summary.supplierPaymentStatus === 'PARTIALLY_PAID'
        ? 'PARTIALLY_PAID_SUPPLIER_INCLUDED_IN_COST'
        : 'supplier-payment-sync';
    try {
      await this.landedCostService.recalculateProcurementOrder(
        order.id,
        { user, reason, triggerReason },
        tx,
      );
    } catch {
      // Landed cost may be blocked (finalized / weight); payment totals above remain source of truth.
    }

    return this.toOrderPaymentSummary(updated);
  }

  private async nextSequenceNumber(tx: Tx, orderId: string) {
    // Order row is already locked by lockOrder(); serialize sequence allocation per purchase.
    const aggregate = await tx.procurementSupplierPayment.aggregate({
      where: { procurementOrderId: orderId },
      _max: { sequenceNumber: true },
    });
    return Number(aggregate._max.sequenceNumber ?? 0) + 1;
  }

  private async lockOrder(tx: Tx, orderId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ProcurementOrder"
      WHERE id = ${orderId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Procurement order not found');
    const order = await tx.procurementOrder.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private async assertNoIrreversibleWarehouseOps(tx: Tx, orderId: string) {
    const receivingCount = await tx.procurementGoodsReceiving.count({
      where: { procurementOrderId: orderId, deletedAt: null },
    });
    if (receivingCount > 0) {
      throw new BadRequestException(
        'Невозможно удалить платеж: на основании этого платежа уже выполнена необратимая складская операция.',
      );
    }
  }

  private async lockPayment(tx: Tx, orderId: string, paymentId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ProcurementSupplierPayment"
      WHERE id = ${paymentId} AND "procurementOrderId" = ${orderId}
      FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Supplier payment not found');
    const payment = await tx.procurementSupplierPayment.findFirst({
      where: { id: paymentId, procurementOrderId: orderId },
    });
    if (!payment) throw new NotFoundException('Supplier payment not found');
    return payment;
  }

  private async getOrderOrThrow(orderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    return order;
  }

  private validateAmounts(amountYuan: number, exchangeRate: number) {
    if (!amountYuan || amountYuan <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (!exchangeRate || exchangeRate <= 0) {
      throw new BadRequestException('Exchange rate must be greater than zero');
    }
  }

  private resolveKgsAdjustment(
    user: AuthUser,
    calculatedAmountKgs: number,
    approvedAmountKgs: number,
    reason?: ProcurementKgsAdjustmentReason,
    comment?: string,
  ) {
    const difference = roundMoney(approvedAmountKgs - calculatedAmountKgs);
    if (Math.abs(difference) <= 0.009) {
      return {
        reason: null as ProcurementKgsAdjustmentReason | null,
        comment: null as string | null,
        adjustedById: null as string | null,
        adjustedAt: null as Date | null,
      };
    }
    if (!reason) {
      throw new BadRequestException('Manual KGS adjustment requires a correction reason');
    }
    return {
      reason,
      comment: comment?.trim() || null,
      adjustedById: user.id,
      adjustedAt: new Date(),
    };
  }

  private validateAndBuildRecipientFields(
    paymentMethod: ProcurementSupplierPaymentMethod,
    dto: {
      recipientName?: string;
      recipientCompany?: string;
      bankName?: string;
      beneficiaryName?: string;
      accountNumber?: string;
      swiftCode?: string;
      cardholderName?: string;
      cardNumber?: string;
      paymentInstructions?: string;
    },
    strict = false,
  ) {
    const recipientName = dto.recipientName?.trim() || null;
    const recipientCompany = dto.recipientCompany?.trim() || null;
    const bankName = dto.bankName?.trim() || null;
    const beneficiaryName = dto.beneficiaryName?.trim() || null;
    const accountNumber = dto.accountNumber?.trim() || null;
    const swiftCode = dto.swiftCode?.trim() || null;
    const cardholderName = dto.cardholderName?.trim() || null;
    const paymentInstructions = dto.paymentInstructions?.trim() || null;
    const cardNumberMasked = dto.cardNumber ? maskCardNumber(dto.cardNumber) : null;

    if (strict || recipientName) {
      if (!recipientName) {
        throw new BadRequestException('Recipient name is required');
      }
    }

    const normalizedMethod = paymentMethod;
    if (strict) {
      if (
        (normalizedMethod === ProcurementSupplierPaymentMethod.BANK_ACCOUNT ||
          normalizedMethod === ProcurementSupplierPaymentMethod.BANK ||
          normalizedMethod === ProcurementSupplierPaymentMethod.TRANSFER) &&
        (!bankName || !beneficiaryName || !accountNumber)
      ) {
        throw new BadRequestException('Bank name, beneficiary name and account number are required');
      }
      if (
        normalizedMethod === ProcurementSupplierPaymentMethod.BANK_CARD &&
        (!cardholderName || !(cardNumberMasked || accountNumber))
      ) {
        throw new BadRequestException('Cardholder name and card details are required');
      }
      if (
        (normalizedMethod === ProcurementSupplierPaymentMethod.OTHER ||
          normalizedMethod === ProcurementSupplierPaymentMethod.QR_CODE) &&
        !paymentInstructions &&
        normalizedMethod === ProcurementSupplierPaymentMethod.OTHER
      ) {
        throw new BadRequestException('Payment instructions are required');
      }
    }

    return {
      recipientName,
      recipientCompany,
      bankName,
      beneficiaryName,
      accountNumber,
      swiftCode,
      cardholderName,
      cardNumberMasked: cardNumberMasked ?? null,
      paymentInstructions,
    };
  }

  private async assertHqFinanceAccount(tx: Tx, accountId: string, forUpdate = false) {
    if (forUpdate) {
      await tx.$queryRaw`
        SELECT id FROM "FinanceAccount"
        WHERE id = ${accountId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
    }
    const account = await tx.financeAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) throw new BadRequestException('Finance account not found');
    if (account.status !== FinanceAccountStatus.ACTIVE) {
      throw new BadRequestException('Finance account is inactive');
    }
    if (account.scope !== FinanceAccountScope.HQ) {
      throw new BadRequestException('Only HQ Finance Accounts can be used for China Purchase payments');
    }
    return account;
  }

  private async assertYuanAllocationAllowed(
    tx: Tx,
    user: AuthUser,
    order: { id: string; totalYuan: any },
    amountYuan: number,
    allowOverpayment: boolean,
    excludePaymentId?: string,
  ) {
    const payments = await tx.procurementSupplierPayment.findMany({
      where: { procurementOrderId: order.id },
      select: { id: true, amountYuan: true, status: true },
    });
    const allocated = payments
      .filter((payment) => payment.id !== excludePaymentId && isAllocatedSupplierPayment(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amountYuan), 0);
    const projected = roundMoney(allocated + amountYuan);
    if (projected > Number(order.totalYuan) + 0.009) {
      if (!allowOverpayment || !canAllowSupplierOverpayment(user)) {
        throw new BadRequestException(
          `Payment CNY amount exceeds remaining unpaid amount. Remaining: ${roundMoney(Math.max(Number(order.totalYuan) - allocated, 0))} CNY`,
        );
      }
    }
  }

  private async notifyPaymentSentToCashier(
    tx: Tx,
    user: AuthUser,
    orderNumber: string,
    orderId: string,
    paymentId: string,
  ) {
    await this.notificationsService.notifyInTx(tx, user, {
      type: AlertType.SUPPLIER_PAYMENT_SENT_TO_CASHIER,
      entityType: 'ProcurementOrder',
      entityId: orderId,
      referenceNumber: orderNumber,
      message: `China purchase payment for ${orderNumber} awaits HQ Cashier (${paymentId}).`,
      recipientRoles: [Role.HQ_CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER],
    });
  }

  private async audit(
    tx: Tx | PrismaService,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProcurementOrder',
        entityId,
        metadata: {
          reason: reason ?? null,
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
