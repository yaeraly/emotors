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
  NotificationModule,
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
import { assertHqCashierAssignedAccount } from '../finance/finance-assignment.util';
import { buildFinanceDocumentNumber, roundMoney } from '../finance/finance-number.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  auditReceiptEvent,
  deliverReceiptsToCreatorInTx,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';
import {
  canConfirmSupplierPayment,
  canCreateSupplierPayment,
  canCreateProcurementOrder,
  canPermanentDeleteBusinessData,
  canProcessHqCargoPayment,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { auditPaymentPermanentlyDeleted } from '../rbac/payment-permanent-delete.audit';
import {
  ApproveTransportExpenseDto,
  ConfirmTransportExpenseDto,
  CreateTransportExpenseDto,
  PayCargoTransportExpenseDto,
  ReturnTransportExpenseDto,
  UpdateTransportExpenseDto,
} from './dto/transport-expense.dto';
import type { PermanentDeleteHqPaymentDto } from './dto/permanent-delete-hq-payment.dto';
import {
  assertCargoTotalsMatchServer,
  calculateCargoPaymentAmounts,
} from './cargo-payment-calc.util';
import { estimateSectionExpenseCostKgs, sumConfirmedExpenseAmountKgs, isExpenseApprovedForLandedCost, resolveTransportExpensePaymentStatus } from './procurement-cost.util';
import {
  blocksNewSectionRequest,
  hasActiveSectionRequest,
  requestTypeForExpenseType,
  summarizeSectionPayments,
  validateSectionPayableSubmit,
} from './section-payable.util';
import { LandedCostService } from './landed-cost.service';
import {
  resolveSupplierPaymentMethodFromAccountType,
  tryResolveSupplierPaymentMethodFromAccountType,
} from './supplier-payment-method-from-account.util';

type Tx = Prisma.TransactionClient;

const EDITABLE = new Set<string>([
  TransportExpenseStatus.DRAFT,
  TransportExpenseStatus.RETURNED,
]);

const CARGO_ACCOUNTANT_PAYABLE = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
]);

const INCLUDE = {
  createdBy: { select: { id: true, fullName: true, role: true } },
  accountant: { select: { id: true, fullName: true, role: true } },
  cashier: { select: { id: true, fullName: true, role: true } },
  returnedBy: { select: { id: true, fullName: true, role: true } },
  financeAccount: {
    select: { id: true, name: true, accountNumber: true, availableBalance: true, currency: true },
  },
  transportCompany: {
    select: {
      id: true,
      name: true,
      companyCode: true,
      contactPerson: true,
      phone: true,
      country: true,
      city: true,
      bankName: true,
      bankAccount: true,
      accountHolder: true,
      status: true,
    },
  },
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
        where: {
          status: {
            in: [TransportExpenseStatus.WAITING_ACCOUNTANT, TransportExpenseStatus.UNDER_REVIEW],
          },
        },
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
        where: {
          status: TransportExpenseStatus.PENDING_CASHIER,
        },
        include: INCLUDE,
        orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      })
      .then((rows) => Promise.all(rows.map((row) => this.toResponse(row))));
  }

  listPaymentLedgerHistory(expenseId: string) {
    return this.prisma.financeLedgerEntry
      .findMany({
        where: {
          referenceType: 'ProcurementTransportExpense',
          referenceId: expenseId,
          entryType: FinanceLedgerEntryType.EXPENSE,
        },
        include: {
          account: { select: { id: true, name: true, typeCode: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          amountKgs: Number(row.amount),
          paidAt: row.createdAt.toISOString(),
          paymentMethod: tryResolveSupplierPaymentMethodFromAccountType(row.account.typeCode),
          actualFinanceAccount: row.account,
          cashier: row.createdBy,
          status: 'ACTIVE',
          transactionNumber: row.entryNumber,
          createdAt: row.createdAt.toISOString(),
        })),
      );
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
      let order: Awaited<ReturnType<typeof tx.procurementOrder.findFirst>> = null;
      if (dto.procurementOrderId) {
        order = await tx.procurementOrder.findFirst({
          where: { id: dto.procurementOrderId, deletedAt: null },
        });
        if (!order) throw new NotFoundException('Procurement order not found');
      }

      const requiresTransportCompany =
        dto.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT ||
        dto.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT ||
        dto.expenseType === TransportExpenseType.LOCAL_DELIVERY;

      let transportCompany: {
        id: string;
        name: string;
        bankName: string | null;
        bankAccount: string | null;
        accountHolder: string | null;
      } | null = null;
      if (dto.transportCompanyId) {
        transportCompany = await tx.transportCompany.findFirst({
          where: { id: dto.transportCompanyId, deletedAt: null, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            bankName: true,
            bankAccount: true,
            accountHolder: true,
          },
        });
        if (!transportCompany) {
          throw new BadRequestException('Transport company not found or inactive');
        }
      } else if (requiresTransportCompany) {
        throw new BadRequestException('Transport company is required');
      }

      const isCargo = dto.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT;
      let cargoCalc: ReturnType<typeof calculateCargoPaymentAmounts> | null = null;
      let amount = roundMoney(dto.amount);
      let currency = (dto.currency || 'KGS').toUpperCase();

      if (isCargo) {
        try {
          cargoCalc = calculateCargoPaymentAmounts({
            totalWeightKg: Number(dto.totalWeightKg),
            cargoRateUsdPerKg: Number(dto.cargoRateUsdPerKg),
            usdExchangeRate: Number(dto.usdExchangeRate),
          });
          assertCargoTotalsMatchServer(cargoCalc, {
            calculatedAmountUsd: dto.calculatedAmountUsd,
            calculatedAmountKgs: dto.calculatedAmountKgs,
            amount: dto.amount,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : 'Invalid cargo calculation');
        }
        amount = cargoCalc.calculatedAmountKgs;
        currency = 'KGS';
      } else if (amount <= 0) {
        throw new BadRequestException('Amount must be greater than zero');
      }

      const paymentMethod = dto.paymentMethod ?? ProcurementPaymentInfoMethod.QR_CODE;
      const requestType =
        dto.requestType?.trim() || requestTypeForExpenseType(dto.expenseType) || null;
      const carrierName =
        transportCompany?.name?.trim() ||
        dto.supplierCarrier?.trim() ||
        dto.recipientName?.trim() ||
        '';
      if (!carrierName) {
        throw new BadRequestException('Transport company / recipient is required');
      }

      if (paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT && !dto.accountNumber?.trim()) {
        throw new BadRequestException('Account number is required for bank account payment method');
      }

      const sectionBudget =
        isCargo && cargoCalc
          ? cargoCalc.calculatedAmountKgs
          : dto.sectionTotalAmount;

      if (dto.procurementOrderId) {
        const siblings = await tx.procurementTransportExpense.findMany({
          where: {
            procurementOrderId: dto.procurementOrderId,
            expenseType: dto.expenseType,
            status: { not: TransportExpenseStatus.CANCELLED },
          },
          select: { amount: true, amountKgs: true, status: true },
        });
        if (blocksNewSectionRequest(siblings)) {
          throw new BadRequestException(
            'An active or returned payment request already exists for this section; resubmit the existing invoice',
          );
        }
        if (dto.sendToAccountant === true && hasActiveSectionRequest(siblings)) {
          throw new BadRequestException('An active payment request already exists for this section');
        }
        const summary = summarizeSectionPayments(
          siblings.map((row) => ({
            amount: Number(row.amount),
            amountKgs: Number(row.amountKgs),
            status: row.status,
          })),
          sectionBudget,
        );
        if (
          summary.remainingAmount > 0 &&
          amount > summary.remainingAmount + 0.009 &&
          Number(sectionBudget || 0) > 0 &&
          !isCargo
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
          supplierCarrier: carrierName,
          transportCompanyId: transportCompany?.id || null,
          expenseName: dto.expenseName?.trim() || null,
          expenseCategory: dto.expenseCategory?.trim() || null,
          recipientName: carrierName,
          route: dto.route?.trim() || null,
          vehicleInfo: dto.vehicleInfo?.trim() || null,
          shipmentReference: dto.shipmentReference?.trim() || null,
          paymentMethod,
          bankName: dto.bankName?.trim() || transportCompany?.bankName || null,
          accountHolder: dto.accountHolder?.trim() || transportCompany?.accountHolder || null,
          accountNumber: dto.accountNumber?.trim() || transportCompany?.bankAccount || null,
          swiftCode: dto.swiftCode?.trim() || null,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
          amount,
          currency,
          amountKgs: currency === 'KGS' ? amount : 0,
          exchangeRate: cargoCalc?.usdExchangeRate ?? null,
          totalWeightKg: cargoCalc?.totalWeightKg ?? null,
          cargoRateUsdPerKg: cargoCalc?.cargoRateUsdPerKg ?? null,
          usdExchangeRate: cargoCalc?.usdExchangeRate ?? null,
          calculatedAmountUsd: cargoCalc?.calculatedAmountUsd ?? null,
          calculatedAmountKgs: cargoCalc?.calculatedAmountKgs ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          comment: dto.comment?.trim() || null,
          status: send ? TransportExpenseStatus.WAITING_ACCOUNTANT : TransportExpenseStatus.DRAFT,
          submittedAt: send ? new Date() : null,
          createdById: user.id,
        },
        include: INCLUDE,
      });

      if (isCargo && cargoCalc && order) {
        await tx.procurementOrder.update({
          where: { id: order.id },
          data: {
            cargoTotalWeightKg: cargoCalc.totalWeightKg,
            cargoRateUsdPerKg: cargoCalc.cargoRateUsdPerKg,
            cargoCompany: carrierName,
            totalCargoCostUsd: cargoCalc.calculatedAmountUsd,
            // Full calculated KGS is the cost base even when payments are partial.
            totalCargoCostKgs: cargoCalc.calculatedAmountKgs,
            chinaExportTransportKgs: cargoCalc.calculatedAmountKgs,
            chinaExportTransportCompanyId: transportCompany?.id || order.chinaExportTransportCompanyId,
          },
        });
        await this.audit(tx, user, 'CARGO_AMOUNT_CALCULATED', created.id, null, {
          procurementOrderId: order.id,
          transportCompanyId: transportCompany?.id ?? null,
          ...cargoCalc,
        });
      }

      if (transportCompany) {
        await this.audit(tx, user, 'TRANSPORT_COMPANY_SELECTED', created.id, null, {
          procurementOrderId: created.procurementOrderId,
          transportCompanyId: transportCompany.id,
          transportCompanyName: transportCompany.name,
          requestType,
        });
      }

      await this.audit(tx, user, 'TRANSPORT_EXPENSE_CREATED', created.id, null, {
        expenseNumber: created.expenseNumber,
        amount,
        currency,
        status: created.status,
        requestType,
        paymentMethod,
        procurementOrderId: created.procurementOrderId,
        transportCompanyId: transportCompany?.id ?? null,
        cargo: cargoCalc,
      });
      if (send) {
        await this.audit(tx, user, this.submitAuditAction(created.expenseType), created.id, null, {
          status: created.status,
          requestType,
          paymentMethod,
          procurementOrderId: created.procurementOrderId,
          transportCompanyId: transportCompany?.id ?? null,
          amount,
          currency,
          cargo: cargoCalc,
        });
        await this.notifyAccountantSubmitted(tx, user, created, transportCompany?.name ?? carrierName, cargoCalc);
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
      const isCargo = existing.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT;
      if (!EDITABLE.has(existing.status)) {
        if (isCargo) {
          throw new BadRequestException('Этот счет карго недоступен для исправления.');
        }
        throw new BadRequestException('Only draft or returned transport expenses can be edited');
      }

      const hasCargoInput =
        dto.totalWeightKg != null ||
        dto.cargoRateUsdPerKg != null ||
        dto.usdExchangeRate != null;

      let cargoCalc: ReturnType<typeof calculateCargoPaymentAmounts> | null = null;
      let amount = dto.amount != null ? roundMoney(dto.amount) : Number(existing.amount);
      let currency = (dto.currency ?? existing.currency).toUpperCase();

      if (isCargo && (hasCargoInput || existing.status === TransportExpenseStatus.RETURNED)) {
        try {
          cargoCalc = calculateCargoPaymentAmounts({
            totalWeightKg:
              dto.totalWeightKg != null
                ? Number(dto.totalWeightKg)
                : Number(existing.totalWeightKg),
            cargoRateUsdPerKg:
              dto.cargoRateUsdPerKg != null
                ? Number(dto.cargoRateUsdPerKg)
                : Number(existing.cargoRateUsdPerKg),
            usdExchangeRate:
              dto.usdExchangeRate != null
                ? Number(dto.usdExchangeRate)
                : Number(existing.usdExchangeRate),
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : 'Invalid cargo calculation');
        }
        amount = cargoCalc.calculatedAmountKgs;
        currency = 'KGS';
      }

      const paymentMethod = dto.paymentMethod ?? existing.paymentMethod;
      if (
        paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT &&
        !(dto.accountNumber !== undefined ? dto.accountNumber?.trim() : existing.accountNumber?.trim())
      ) {
        throw new BadRequestException('Account number is required for bank account payment method');
      }

      const carrierName =
        dto.supplierCarrier?.trim() ||
        dto.recipientName?.trim() ||
        existing.supplierCarrier ||
        existing.recipientName ||
        '';

      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          expenseType: dto.expenseType ?? existing.expenseType,
          requestType:
            dto.requestType !== undefined
              ? dto.requestType?.trim() || null
              : existing.requestType,
          supplierCarrier: carrierName || existing.supplierCarrier,
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
          exchangeRate: cargoCalc?.usdExchangeRate ?? existing.exchangeRate,
          totalWeightKg: cargoCalc?.totalWeightKg ?? existing.totalWeightKg,
          cargoRateUsdPerKg: cargoCalc?.cargoRateUsdPerKg ?? existing.cargoRateUsdPerKg,
          usdExchangeRate: cargoCalc?.usdExchangeRate ?? existing.usdExchangeRate,
          calculatedAmountUsd: cargoCalc?.calculatedAmountUsd ?? existing.calculatedAmountUsd,
          calculatedAmountKgs: cargoCalc?.calculatedAmountKgs ?? existing.calculatedAmountKgs,
          dueDate:
            dto.dueDate !== undefined
              ? dto.dueDate
                ? new Date(dto.dueDate)
                : null
              : existing.dueDate,
          comment: dto.comment !== undefined ? dto.comment?.trim() || null : existing.comment,
          // Keep RETURNED until explicit resubmit so SM edits stay on the same invoice.
        },
        include: INCLUDE,
      });

      if (isCargo && cargoCalc && existing.procurementOrderId) {
        const order = await tx.procurementOrder.findFirst({
          where: { id: existing.procurementOrderId, deletedAt: null },
        });
        if (order) {
          await tx.procurementOrder.update({
            where: { id: order.id },
            data: {
              cargoTotalWeightKg: cargoCalc.totalWeightKg,
              cargoRateUsdPerKg: cargoCalc.cargoRateUsdPerKg,
              totalCargoCostUsd: cargoCalc.calculatedAmountUsd,
              totalCargoCostKgs: cargoCalc.calculatedAmountKgs,
              chinaExportTransportKgs: cargoCalc.calculatedAmountKgs,
            },
          });
        }
      }

      const cargoAuditBase = {
        cargoPaymentId: id,
        procurementOrderId: existing.procurementOrderId,
        actorUserId: user.id,
        timestamp: new Date().toISOString(),
      };

      if (isCargo && existing.status === TransportExpenseStatus.RETURNED) {
        await this.audit(tx, user, 'CARGO_PAYMENT_CORRECTED', id, {
          oldTotalWeightKg: Number(existing.totalWeightKg ?? 0),
          oldCargoRateUsdPerKg: Number(existing.cargoRateUsdPerKg ?? 0),
          oldUsdExchangeRate: Number(existing.usdExchangeRate ?? 0),
          oldCalculatedAmountUsd: Number(existing.calculatedAmountUsd ?? 0),
          oldCalculatedAmountKgs: Number(existing.calculatedAmountKgs ?? 0),
        }, {
          newTotalWeightKg: Number(updated.totalWeightKg ?? 0),
          newCargoRateUsdPerKg: Number(updated.cargoRateUsdPerKg ?? 0),
          newUsdExchangeRate: Number(updated.usdExchangeRate ?? 0),
          newCalculatedAmountUsd: Number(updated.calculatedAmountUsd ?? 0),
          newCalculatedAmountKgs: Number(updated.calculatedAmountKgs ?? 0),
          ...cargoAuditBase,
        });
      }

      if (
        isCargo &&
        cargoCalc &&
        (Number(existing.calculatedAmountUsd ?? 0) !== cargoCalc.calculatedAmountUsd ||
          Number(existing.calculatedAmountKgs ?? 0) !== cargoCalc.calculatedAmountKgs)
      ) {
        await this.audit(tx, user, 'CARGO_PAYMENT_RECALCULATED', id, {
          oldCalculatedAmountUsd: Number(existing.calculatedAmountUsd ?? 0),
          oldCalculatedAmountKgs: Number(existing.calculatedAmountKgs ?? 0),
        }, {
          newCalculatedAmountUsd: cargoCalc.calculatedAmountUsd,
          newCalculatedAmountKgs: cargoCalc.calculatedAmountKgs,
          ...cargoAuditBase,
        });
      }

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
      const cargoReceiptCount = await tx.fileAttachment.count({
        where: {
          entityType: FileAttachmentEntityType.CARGO_RECEIPT,
          entityId: id,
          deletedAt: null,
        },
      });

      if (
        (expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT ||
          expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT ||
          expense.expenseType === TransportExpenseType.LOCAL_DELIVERY) &&
        !expense.transportCompanyId
      ) {
        throw new BadRequestException('Transport company is required');
      }

      if (
        expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT &&
        cargoReceiptCount <= 0
      ) {
        throw new BadRequestException('Cargo receipt is required');
      }

      const siblings = await tx.procurementTransportExpense.findMany({
        where: {
          procurementOrderId: expense.procurementOrderId,
          expenseType: expense.expenseType,
          id: { not: id },
          status: { not: TransportExpenseStatus.CANCELLED },
        },
        select: { amount: true, amountKgs: true, status: true },
      });
      if (blocksNewSectionRequest(siblings)) {
        throw new BadRequestException(
          'An active or returned payment request already exists for this section',
        );
      }
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
          transportCompanyId: updated.transportCompanyId,
          amount: Number(updated.amount),
          currency: updated.currency,
        },
      );
      if (
        expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT &&
        expense.status === TransportExpenseStatus.RETURNED
      ) {
        await this.audit(tx, user, 'CARGO_PAYMENT_RESUBMITTED', id, {
          status: expense.status,
          calculatedAmountUsd: Number(expense.calculatedAmountUsd ?? 0),
          calculatedAmountKgs: Number(expense.calculatedAmountKgs ?? 0),
        }, {
          status: updated.status,
          calculatedAmountUsd: Number(updated.calculatedAmountUsd ?? 0),
          calculatedAmountKgs: Number(updated.calculatedAmountKgs ?? 0),
          cargoPaymentId: id,
          procurementOrderId: updated.procurementOrderId,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
      await this.audit(tx, user, 'REQUEST_SENT_TO_ACCOUNTANT', id, null, {
        procurementOrderId: updated.procurementOrderId,
        transportCompanyId: updated.transportCompanyId,
        requestType: updated.requestType,
        amount: Number(updated.amount),
        currency: updated.currency,
      });
      await this.notifyAccountantSubmitted(
        tx,
        user,
        updated,
        updated.transportCompany?.name || updated.recipientName || updated.supplierCarrier,
        updated.calculatedAmountKgs != null
          ? {
              totalWeightKg: Number(updated.totalWeightKg || 0),
              cargoRateUsdPerKg: Number(updated.cargoRateUsdPerKg || 0),
              usdExchangeRate: Number(updated.usdExchangeRate || 0),
              calculatedAmountUsd: Number(updated.calculatedAmountUsd || 0),
              calculatedAmountKgs: Number(updated.calculatedAmountKgs || 0),
            }
          : null,
      );
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
      if (
        expense.status !== TransportExpenseStatus.WAITING_ACCOUNTANT &&
        expense.status !== TransportExpenseStatus.UNDER_REVIEW &&
        expense.status !== TransportExpenseStatus.PAYMENT_POSTPONED
      ) {
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
      if (send && !dto.financeAccountId && !expense.financeAccountId) {
        throw new BadRequestException('Finance account is required before sending to cashier');
      }

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
          executionStatus: send ? 'PENDING_EXECUTION' : expense.executionStatus,
          executionStartedAt: send ? null : expense.executionStartedAt,
          failureReason: send ? null : expense.failureReason,
          cashierId: send ? null : expense.cashierId,
        },
        include: INCLUDE,
      });

      await this.audit(tx, user, 'TRANSPORT_EXPENSE_APPROVED', id, { status: expense.status }, {
        status: updated.status,
        amountKgs,
        exchangeRate,
      });

      if (isExpenseApprovedForLandedCost(updated.status)) {
        await this.syncOrderSectionCostFromApprovedExpenses(tx, user, updated);
        await this.audit(tx, user, 'PROCUREMENT_APPROVED_EXPENSE_INCLUDED_IN_COST', id, null, {
          procurementOrderId: updated.procurementOrderId,
          expenseId: updated.id,
          expenseType: updated.expenseType,
          approvedAmount: amountKgs,
          approvalStatus: 'APPROVED',
          paymentStatus: resolveTransportExpensePaymentStatus({
            status: updated.status,
            paidAmountKgs: Number(updated.paidAmountKgs ?? 0),
            approvedAmountKgs: amountKgs,
          }),
          includedInLandedCost: true,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
        if (updated.expenseType === TransportExpenseType.LOCAL_DELIVERY) {
          await this.audit(tx, user, 'KYRGYZSTAN_TRANSPORT_ALLOCATED', updated.procurementOrderId ?? id, null, {
            procurementOrderId: updated.procurementOrderId,
            expenseId: updated.id,
            approvedAmount: amountKgs,
            expenseType: updated.expenseType,
            actorUserId: user.id,
            timestamp: new Date().toISOString(),
          });
        }
      }

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
        expense.status !== TransportExpenseStatus.UNDER_REVIEW &&
        expense.status !== TransportExpenseStatus.PENDING_CASHIER &&
        expense.status !== TransportExpenseStatus.PARTIALLY_PAID
      ) {
        throw new BadRequestException('Expense cannot be returned in current status');
      }
      const fromCashier =
        expense.status === TransportExpenseStatus.PENDING_CASHIER ||
        expense.status === TransportExpenseStatus.PARTIALLY_PAID;
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: TransportExpenseStatus.RETURNED,
          executionStatus: fromCashier ? 'RETURNED_TO_ACCOUNTANT' : expense.executionStatus,
          returnReason: dto.reason.trim(),
          returnedAt: new Date(),
          returnedById: user.id,
        },
        include: INCLUDE,
      });
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_RETURNED', id, { status: expense.status }, {
        status: updated.status,
        executionStatus: updated.executionStatus,
        returnReason: updated.returnReason,
      });
      if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
        await this.audit(tx, user, 'CARGO_PAYMENT_RETURNED_FOR_CORRECTION', id, {
          status: expense.status,
          calculatedAmountUsd: Number(expense.calculatedAmountUsd ?? 0),
          calculatedAmountKgs: Number(expense.calculatedAmountKgs ?? 0),
        }, {
          status: updated.status,
          returnReason: updated.returnReason,
          cargoPaymentId: id,
          procurementOrderId: expense.procurementOrderId,
          totalWeightKg: Number(expense.totalWeightKg ?? 0),
          cargoRateUsdPerKg: Number(expense.cargoRateUsdPerKg ?? 0),
          usdExchangeRate: Number(expense.usdExchangeRate ?? 0),
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_RETURNED,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: `Transport expense ${expense.expenseNumber} was returned: ${dto.reason.trim()}`,
        recipientRoles: fromCashier
          ? [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.SUPPLY_CHAIN_MANAGER]
          : [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER],
      });
      return this.toResponse(updated, tx);
    });
  }

  returnCargoForCorrection(user: AuthUser, id: string, dto: ReturnTransportExpenseDto) {
    if (!canCreateSupplierPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant can return cargo invoices for correction');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (expense.expenseType !== TransportExpenseType.INTERNATIONAL_FREIGHT) {
        throw new BadRequestException('Only cargo payment invoices support accountant return for correction');
      }
      return this.returnCargoForCorrectionInTx(tx, user, expense, dto);
    });
  }

  private async returnCargoForCorrectionInTx(
    tx: Tx,
    user: AuthUser,
    expense: {
      id: string;
      expenseNumber: string;
      expenseType: TransportExpenseType;
      status: TransportExpenseStatus;
      procurementOrderId: string | null;
      executionStatus: string | null;
      paidAmountKgs: unknown;
      calculatedAmountUsd: unknown;
      calculatedAmountKgs: unknown;
      totalWeightKg: unknown;
      cargoRateUsdPerKg: unknown;
      usdExchangeRate: unknown;
      returnReason: string | null;
    },
    dto: ReturnTransportExpenseDto,
  ) {
    const paidAmountKgs = Number(expense.paidAmountKgs || 0);
    if (paidAmountKgs > 0.009) {
      throw new BadRequestException(
        'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.',
      );
    }

    const ledgerCount = await tx.financeLedgerEntry.count({
      where: {
        referenceType: 'ProcurementTransportExpense',
        referenceId: expense.id,
        entryType: FinanceLedgerEntryType.EXPENSE,
      },
    });
    if (ledgerCount > 0) {
      throw new BadRequestException(
        'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.',
      );
    }

    if (dto.idempotencyKey) {
      const prior = await tx.auditLog.findMany({
        where: {
          entity: 'ProcurementTransportExpense',
          entityId: expense.id,
          action: 'CARGO_PAYMENT_RETURNED_FOR_CORRECTION',
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });
      const duplicate = prior.find((row) => {
        const meta = row.metadata as { idempotencyKey?: string } | null;
        return meta?.idempotencyKey === dto.idempotencyKey;
      });
      if (duplicate) {
        const current = await tx.procurementTransportExpense.findUnique({
          where: { id: expense.id },
          include: INCLUDE,
        });
        return this.toResponse(current!, tx);
      }
    }

    if (expense.status === TransportExpenseStatus.RETURNED) {
      const current = await tx.procurementTransportExpense.findUnique({
        where: { id: expense.id },
        include: INCLUDE,
      });
      return this.toResponse(current!, tx);
    }

    if (
      !CARGO_ACCOUNTANT_PAYABLE.has(expense.status) &&
      expense.status !== TransportExpenseStatus.PAYMENT_POSTPONED &&
      expense.status !== TransportExpenseStatus.PENDING_CASHIER
    ) {
      throw new BadRequestException('Expense cannot be returned in current status');
    }

    const reason = dto.reason.trim();
    const comment = dto.comment?.trim() || '';
    const combinedReason = comment ? `${reason}\n${comment}` : reason;

    const updated = await tx.procurementTransportExpense.update({
      where: { id: expense.id },
      data: {
        status: TransportExpenseStatus.RETURNED,
        executionStatus: null,
        returnReason: combinedReason,
        returnedAt: new Date(),
        returnedById: user.id,
        sentToCashierAt: null,
        cashierInstructionAmountKgs: null,
        accountantId: user.id,
      },
      include: INCLUDE,
    });

    await this.audit(tx, user, 'TRANSPORT_EXPENSE_RETURNED', expense.id, { status: expense.status }, {
      status: updated.status,
      returnReason: updated.returnReason,
    });

    const approvedAmount = Number(expense.calculatedAmountKgs ?? updated.amountKgs ?? updated.amount ?? 0);
    await this.audit(tx, user, 'CARGO_PAYMENT_RETURNED_FOR_CORRECTION', expense.id, {
      action: 'RETURN',
      oldStatus: expense.status,
      approvalStatus: 'RETURNED_FOR_CORRECTION',
      paymentStatus: 'UNPAID',
      approvedAmount,
      paidAmount: paidAmountKgs,
      remainingAmount: approvedAmount,
    }, {
      action: 'RETURN',
      newStatus: updated.status,
      approvalStatus: 'RETURNED_FOR_CORRECTION',
      correctionStatus: 'NEEDS_REVISION',
      costAllocationStatus: 'EXCLUDED',
      returnReason: combinedReason,
      correctionReason: reason,
      cargoPaymentId: expense.id,
      invoiceId: expense.id,
      procurementOrderId: expense.procurementOrderId,
      totalWeightKg: Number(expense.totalWeightKg ?? 0),
      cargoRateUsdPerKg: Number(expense.cargoRateUsdPerKg ?? 0),
      usdExchangeRate: Number(expense.usdExchangeRate ?? 0),
      actorUserId: user.id,
      actorRole: user.role,
      timestamp: new Date().toISOString(),
      idempotencyKey: dto.idempotencyKey ?? null,
    });

    if (expense.procurementOrderId) {
      await this.syncOrderSectionCostFromApprovedExpenses(tx, user, updated);
    }

    await this.notifications.notifyInTx(tx, user, {
      type: AlertType.TRANSPORT_EXPENSE_RETURNED,
      entityType: 'ProcurementTransportExpense',
      entityId: expense.id,
      referenceNumber: expense.expenseNumber,
      message: `Cargo payment ${expense.expenseNumber} returned for correction: ${reason}`,
      recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.PROCUREMENT_MANAGER],
    });

    return this.toResponse(updated, tx);
  }

  payCargoByAccountant(user: AuthUser, id: string, dto: PayCargoTransportExpenseDto) {
    if (!canProcessHqCargoPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant can approve cargo payment instructions');
    }
    return this.prisma.$transaction(async (tx) => {
      let expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (expense.expenseType !== TransportExpenseType.INTERNATIONAL_FREIGHT) {
        throw new BadRequestException('Only cargo payment invoices support accountant approval');
      }
      if (expense.status === TransportExpenseStatus.PENDING_CASHIER) {
        throw new BadRequestException('Счет уже отправлен HQ Cashier.');
      }
      if (!CARGO_ACCOUNTANT_PAYABLE.has(expense.status)) {
        if (expense.status === TransportExpenseStatus.RETURNED) {
          throw new BadRequestException('Счет возвращён на исправление.');
        }
        if (expense.status === TransportExpenseStatus.PAID) {
          throw new BadRequestException('Этот счёт уже полностью оплачен.');
        }
        throw new BadRequestException('Счет ещё не одобрен для обработки.');
      }

      if (dto.idempotencyKey) {
        const prior = await tx.auditLog.findMany({
          where: {
            entity: 'ProcurementTransportExpense',
            entityId: id,
            action: {
              in: [
                'CARGO_PAYMENT_SENT_TO_HQ_CASHIER',
                'CARGO_PAYMENT_APPROVED_BY_HQ_ACCOUNTANT',
                'CARGO_PARTIAL_PAYMENT_INSTRUCTION_CREATED',
              ],
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 30,
        });
        const duplicate = prior.find((row) => {
          const meta = row.metadata as { idempotencyKey?: string } | null;
          return meta?.idempotencyKey === dto.idempotencyKey;
        });
        if (duplicate) {
          return this.toResponse(expense, tx);
        }
      }

      const account = await this.assertHqAccountForPayment(tx, dto.financeAccountId);
      const derivedPaymentMethod = resolveSupplierPaymentMethodFromAccountType(account.typeCode);
      const procurementPaymentMethod =
        derivedPaymentMethod === 'QR_CODE'
          ? ProcurementPaymentInfoMethod.QR_CODE
          : ProcurementPaymentInfoMethod.BANK_ACCOUNT;

      const approvedAmountKgs =
        Number(expense.amountKgs) > 0
          ? Number(expense.amountKgs)
          : Number(expense.calculatedAmountKgs || expense.amount);
      const alreadyPaid = Number(expense.paidAmountKgs || 0);
      const remaining = roundMoney(Math.max(approvedAmountKgs - alreadyPaid, 0));
      if (!(remaining > 0)) {
        throw new BadRequestException('Этот счёт уже полностью оплачен.');
      }

      const instructionAmount = roundMoney(dto.paymentAmountKgs);
      if (!(instructionAmount > 0)) {
        throw new BadRequestException('Сумма платежа должна быть больше нуля.');
      }
      if (instructionAmount > remaining + 0.009) {
        throw new BadRequestException('Сумма частичного платежа превышает остаток.');
      }

      const isFirstApproval =
        expense.status === TransportExpenseStatus.WAITING_ACCOUNTANT ||
        expense.status === TransportExpenseStatus.UNDER_REVIEW ||
        expense.status === TransportExpenseStatus.PAYMENT_POSTPONED;

      if (isFirstApproval) {
        expense = await tx.procurementTransportExpense.update({
          where: { id },
          data: {
            amountKgs: approvedAmountKgs,
            exchangeRate: expense.usdExchangeRate ?? expense.exchangeRate,
            approvedAt: expense.approvedAt ?? new Date(),
          },
        });
        await this.syncOrderSectionCostFromApprovedExpenses(tx, user, expense);
        await this.audit(tx, user, 'CARGO_PAYMENT_APPROVED_BY_HQ_ACCOUNTANT', id, {
          status: expense.status,
          approvedAmountKgs,
        }, {
          cargoPaymentId: id,
          invoiceId: id,
          procurementOrderId: expense.procurementOrderId,
          approvedPaymentAmount: approvedAmountKgs,
          accountId: account.id,
          derivedPaymentMethod,
          accountantUserId: user.id,
          oldStatus: expense.status,
          newStatus: TransportExpenseStatus.PENDING_CASHIER,
        });
      }

      const isPartialInstruction = instructionAmount + 0.009 < remaining;
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: TransportExpenseStatus.PENDING_CASHIER,
          cashierInstructionAmountKgs: instructionAmount,
          financeAccountId: account.id,
          paymentMethod: procurementPaymentMethod,
          accountantId: user.id,
          accountantComment: dto.accountantComment?.trim() || expense.accountantComment,
          sentToCashierAt: new Date(),
          executionStatus: 'PENDING_EXECUTION',
          executionStartedAt: null,
          failureReason: null,
          cashierId: null,
        },
        include: INCLUDE,
      });

      const instructionAudit = {
        cargoPaymentId: id,
        invoiceId: id,
        procurementOrderId: expense.procurementOrderId,
        instructionId: id,
        approvedPaymentAmount: instructionAmount,
        accountId: account.id,
        derivedPaymentMethod,
        accountantUserId: user.id,
        oldStatus: expense.status,
        newStatus: updated.status,
        idempotencyKey: dto.idempotencyKey ?? null,
        paidAmount: alreadyPaid,
        remainingAmount: remaining,
        timestamp: new Date().toISOString(),
      };

      if (isPartialInstruction) {
        await this.audit(tx, user, 'CARGO_PARTIAL_PAYMENT_INSTRUCTION_CREATED', id, {
          status: expense.status,
          paidAmountKgs: alreadyPaid,
        }, instructionAudit);
      }

      await this.audit(tx, user, 'CARGO_PAYMENT_SENT_TO_HQ_CASHIER', id, {
        status: expense.status,
        paidAmountKgs: alreadyPaid,
      }, instructionAudit);

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_SENT_TO_CASHIER,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message: 'Новый счет «Оплата карго» ожидает оплаты.',
        recipientRoles: [Role.HQ_CASHIER, Role.FINANCE_MANAGER],
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

      const financeAccountId = expense.financeAccountId || dto.financeAccountId;
      if (!financeAccountId) {
        throw new BadRequestException('Debit account is required');
      }
      if (
        expense.financeAccountId &&
        dto.financeAccountId &&
        dto.financeAccountId !== expense.financeAccountId
      ) {
        throw new BadRequestException('Cashier must use the accountant-selected account');
      }

      const account = await this.assertHqAccount(tx, financeAccountId);
      await assertHqCashierAssignedAccount(this.prisma, user, account.id);
      const requestedKgs = Number(expense.amountKgs) > 0 ? Number(expense.amountKgs) : Number(expense.amount);
      const alreadyPaid = Number(expense.paidAmountKgs || 0);
      const remaining = roundMoney(Math.max(requestedKgs - alreadyPaid, 0));
      if (!(remaining > 0)) throw new BadRequestException('Expense is already fully paid');

      const instructionAmount =
        expense.cashierInstructionAmountKgs != null
          ? roundMoney(Number(expense.cashierInstructionAmountKgs))
          : remaining;
      const payNow =
        dto.paidAmountKgs != null ? roundMoney(dto.paidAmountKgs) : instructionAmount;
      if (!(payNow > 0)) throw new BadRequestException('Сумма платежа должна быть больше нуля.');
      if (Math.abs(payNow - instructionAmount) > 0.009) {
        throw new BadRequestException('Cashier cannot change the accountant-approved payment amount');
      }
      if (payNow > remaining + 0.009) {
        throw new BadRequestException('Сумма платежа превышает остаток по счету.');
      }
      if (payNow > Number(account.availableBalance) + 0.009) {
        throw new BadRequestException('Insufficient balance on finance account');
      }

      const ledger = await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: account.id,
        branchId: null,
        entryType: FinanceLedgerEntryType.EXPENSE,
        amount: payNow,
        currency: 'KGS',
        referenceType: 'ProcurementTransportExpense',
        referenceId: id,
        notes: `Transport expense ${expense.expenseNumber}${payNow + 0.009 < remaining ? ' (partial)' : ''}`,
      });

      const newPaidTotal = roundMoney(alreadyPaid + payNow);
      const fullyPaid = newPaidTotal + 0.009 >= requestedKgs;
      const updated = await tx.procurementTransportExpense.update({
        where: { id },
        data: {
          status: fullyPaid ? TransportExpenseStatus.PAID : TransportExpenseStatus.PARTIALLY_PAID,
          executionStatus: fullyPaid ? 'COMPLETED' : null,
          paidAmountKgs: newPaidTotal,
          financeAccountId: account.id,
          ledgerEntryId: ledger.id,
          cashierId: user.id,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          transactionNumber: dto.transactionNumber?.trim() || ledger.entryNumber || null,
          cashierComment: dto.cashierComment?.trim() || null,
          failureReason: null,
          cashierInstructionAmountKgs: null,
          sentToCashierAt: fullyPaid ? expense.sentToCashierAt : null,
        },
        include: INCLUDE,
      });

      await this.audit(
        tx,
        user,
        fullyPaid ? 'TRANSPORT_EXPENSE_PAID' : 'TRANSPORT_EXPENSE_PARTIALLY_PAID',
        id,
        { status: expense.status, paidAmountKgs: alreadyPaid },
        {
          status: updated.status,
          paidNowKgs: payNow,
          paidAmountKgs: newPaidTotal,
          requestedKgs,
          remainingKgs: roundMoney(Math.max(requestedKgs - newPaidTotal, 0)),
          financeAccountId: account.id,
          ledgerEntryId: ledger.id,
          exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
          // Cost base remains full calculated/requested amount — never reduced by partial payment.
          costBaseKgs:
            expense.calculatedAmountKgs != null
              ? Number(expense.calculatedAmountKgs)
              : requestedKgs,
        },
      );
      if (!fullyPaid && expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
        const newRemaining = roundMoney(Math.max(requestedKgs - newPaidTotal, 0));
        const partialAudit = {
          invoiceId: id,
          cargoPaymentId: id,
          procurementOrderId: expense.procurementOrderId,
          oldPaidAmount: alreadyPaid,
          newPaidAmount: newPaidTotal,
          oldRemainingAmount: remaining,
          newRemainingAmount: newRemaining,
          oldStatus: expense.status,
          newStatus: updated.status,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        };
        await this.audit(tx, user, 'CARGO_PARTIAL_PAYMENT', id, {
          status: expense.status,
          paidAmountKgs: alreadyPaid,
        }, {
          procurementOrderId: expense.procurementOrderId,
          cargoInvoiceId: id,
          paymentStatus: updated.status,
          paidAmount: newPaidTotal,
          remainingAmount: newRemaining,
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
        await this.audit(tx, user, 'CARGO_PARTIAL_PAYMENT_CREATED', id, {
          status: expense.status,
          paidAmountKgs: alreadyPaid,
        }, partialAudit);
        await this.audit(tx, user, 'CARGO_PAYMENT_REMAINING_UPDATED', id, {
          status: expense.status,
          paidAmountKgs: alreadyPaid,
        }, partialAudit);
      }
      if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
        await this.audit(tx, user, 'CARGO_PAYMENT_EXECUTED_BY_HQ_CASHIER', id, {
          status: expense.status,
          paidAmountKgs: alreadyPaid,
        }, {
          cargoPaymentId: id,
          invoiceId: id,
          procurementOrderId: expense.procurementOrderId,
          instructionId: id,
          approvedPaymentAmount: payNow,
          accountId: account.id,
          cashierUserId: user.id,
          oldStatus: expense.status,
          newStatus: updated.status,
          paymentId: ledger.id,
          ledgerEntryId: ledger.id,
          timestamp: new Date().toISOString(),
        });
        if (fullyPaid) {
          await this.audit(tx, user, 'CARGO_PAYMENT_FULLY_PAID', id, {
            paidAmountKgs: alreadyPaid,
          }, {
            invoiceId: id,
            cargoPaymentId: id,
            procurementOrderId: expense.procurementOrderId,
            oldPaidAmount: alreadyPaid,
            newPaidAmount: newPaidTotal,
            oldRemainingAmount: remaining,
            newRemainingAmount: 0,
            oldStatus: expense.status,
            newStatus: updated.status,
            actorUserId: user.id,
            cashierUserId: user.id,
            timestamp: new Date().toISOString(),
          });
        }
      }
      await this.syncOrderSectionCostFromApprovedExpenses(tx, user, updated);
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.TRANSPORT_EXPENSE_PAID,
        entityType: 'ProcurementTransportExpense',
        entityId: id,
        referenceNumber: expense.expenseNumber,
        message:
          expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
            ? 'Счет «Оплата карго» обработан HQ Cashier. Квитанция доступна в деталях счета.'
            : fullyPaid
              ? `Transport expense ${expense.expenseNumber} was paid in full.`
              : `Transport expense ${expense.expenseNumber} received a partial payment of ${payNow.toFixed(2)} KGS.`,
        recipientRoles: [Role.SUPPLY_CHAIN_MANAGER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });

      const creatorUserId = resolveInvoiceCreatorUserId({
        expenseCreatedById: expense.createdById,
      });
      if (creatorUserId) {
        await deliverReceiptsToCreatorInTx(tx, this.notifications, user, {
          source: 'TRANSPORT_EXPENSE',
          invoiceId: expense.procurementOrderId ?? expense.id,
          paymentId: expense.id,
          invoiceNumber: expense.expenseNumber,
          invoiceStatus: updated.status,
          processedAt: updated.paidAt ?? new Date(),
          creatorUserId,
          notificationEntityType: 'ProcurementTransportExpense',
          notificationEntityId: expense.id,
          module: NotificationModule.SUPPLIER_PAYMENT,
        });
      }
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

  attachCompanyQr(user: AuthUser, id: string, transportCompanyId: string) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');
      if (!EDITABLE.has(expense.status)) {
        throw new BadRequestException('QR codes can only be changed on draft or returned expenses');
      }
      if (expense.paymentMethod !== ProcurementPaymentInfoMethod.QR_CODE) {
        throw new BadRequestException('Payment method must be QR Code to attach QR attachments');
      }
      const companyId = transportCompanyId || expense.transportCompanyId;
      if (!companyId) throw new BadRequestException('Transport company is required');

      const companyQrs = await tx.fileAttachment.findMany({
        where: {
          deletedAt: null,
          OR: [
            { transportCompanyId: companyId, entityType: FileAttachmentEntityType.PAYMENT_QR },
            { entityId: companyId, entityType: FileAttachmentEntityType.PAYMENT_QR },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!companyQrs.length) {
        throw new BadRequestException('Selected transport company has no QR attachments');
      }

      const created: Array<{ id: string }> = [];
      for (const qr of companyQrs) {
        const row = await tx.fileAttachment.create({
          data: {
            entityType: FileAttachmentEntityType.PAYMENT_QR,
            entityId: id,
            fileName: qr.fileName,
            fileUrl: qr.fileUrl,
            mimeType: qr.mimeType,
            size: qr.size,
            description: qr.description,
            uploadedById: user.id,
            transportCompanyId: companyId,
          },
        });
        created.push(row);
      }
      await this.audit(tx, user, 'TRANSPORT_EXPENSE_QR_COPIED_FROM_COMPANY', id, null, {
        transportCompanyId: companyId,
        count: created.length,
        attachmentIds: created.map((row) => row.id),
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
    const canUploadReceipt =
      canConfirmSupplierPayment(user) || canProcessHqCargoPayment(user);
    if (
      (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE ||
        entityType === FileAttachmentEntityType.PAYMENT_QR ||
        entityType === FileAttachmentEntityType.CARGO_RECEIPT) &&
      !canUploadInvoice
    ) {
      throw new ForbiddenException('Forbidden');
    }
    if (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT && !canUploadReceipt) {
      throw new ForbiddenException('Forbidden');
    }
    if (
      (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE ||
        entityType === FileAttachmentEntityType.CARGO_RECEIPT) &&
      !EDITABLE.has(expense.status) &&
      !hasAnyFullAccessRole(roles)
    ) {
      throw new BadRequestException(
        entityType === FileAttachmentEntityType.CARGO_RECEIPT
          ? 'Cargo receipt can only be attached to draft or returned expenses'
          : 'Invoice can only be attached to draft or returned expenses',
      );
    }
    if (
      entityType === FileAttachmentEntityType.CARGO_RECEIPT &&
      expense.expenseType !== TransportExpenseType.INTERNATIONAL_FREIGHT
    ) {
      throw new BadRequestException('Cargo receipt is only allowed for cargo payment requests');
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
      if (entityType === FileAttachmentEntityType.CARGO_RECEIPT) {
        await tx.fileAttachment.updateMany({
          where: {
            entityType: FileAttachmentEntityType.CARGO_RECEIPT,
            entityId: id,
            deletedAt: null,
          },
          data: { deletedAt: new Date(), isCurrent: false },
        });
      }
      const created = await tx.fileAttachment.create({
        data: {
          entityType,
          entityId: id,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          size: buffer.length,
          uploadedById: user.id,
          isCurrent: true,
        },
      });
      if (entityType === FileAttachmentEntityType.CARGO_RECEIPT) {
        await tx.procurementTransportExpense.update({
          where: { id },
          data: { cargoReceiptAttachmentId: created.id },
        });
      }
      const auditAction =
        entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT
          ? 'TRANSPORT_EXPENSE_RECEIPT_UPLOADED'
          : entityType === FileAttachmentEntityType.CARGO_RECEIPT
            ? 'CARGO_RECEIPT_UPLOADED'
            : 'TRANSPORT_EXPENSE_INVOICE_UPLOADED';
      await this.audit(tx, user, auditAction, id, null, {
        attachmentId: created.id,
        fileName: created.fileName,
        entityType,
        procurementOrderId: expense.procurementOrderId,
        note:
          entityType === FileAttachmentEntityType.CARGO_RECEIPT
            ? 'Cargo receipt (Supply Manager) — separate from accountant/cashier payment receipt'
            : null,
      });
      if (entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT) {
        await auditReceiptEvent(tx, user, 'RECEIPT_UPLOADED', id, {
          invoiceId: expense.procurementOrderId ?? id,
          paymentId: id,
          uploadedBy: user.id,
          creatorUserId: expense.createdById,
          uploadedAt: created.createdAt.toISOString(),
          filename: created.fileName,
          attachmentId: created.id,
        });
      }
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
    return this.assertHqAccountForPayment(tx, accountId);
  }

  private async assertHqAccountForPayment(tx: Tx, accountId: string) {
    const account = await tx.financeAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account || account.status !== FinanceAccountStatus.ACTIVE) {
      throw new BadRequestException('Выбранный счёт недоступен.');
    }
    if (account.scope !== FinanceAccountScope.HQ) {
      throw new BadRequestException('Выбранный счёт не принадлежит HQ.');
    }
    if (!tryResolveSupplierPaymentMethodFromAccountType(account.typeCode)) {
      throw new BadRequestException('Выбранный счёт недоступен.');
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
      paidAmountKgs: Number(expense.paidAmountKgs || 0),
      cashierInstructionAmountKgs:
        expense.cashierInstructionAmountKgs != null
          ? Number(expense.cashierInstructionAmountKgs)
          : null,
      exchangeRate: expense.exchangeRate != null ? Number(expense.exchangeRate) : null,
      totalWeightKg: expense.totalWeightKg != null ? Number(expense.totalWeightKg) : null,
      cargoRateUsdPerKg:
        expense.cargoRateUsdPerKg != null ? Number(expense.cargoRateUsdPerKg) : null,
      usdExchangeRate: expense.usdExchangeRate != null ? Number(expense.usdExchangeRate) : null,
      calculatedAmountUsd:
        expense.calculatedAmountUsd != null ? Number(expense.calculatedAmountUsd) : null,
      calculatedAmountKgs:
        expense.calculatedAmountKgs != null ? Number(expense.calculatedAmountKgs) : null,
      invoices: attachments.filter(
        (a) => a.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE,
      ),
      receipts: attachments.filter(
        (a) => a.entityType === FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
      ),
      cargoReceipts: attachments.filter(
        (a) => a.entityType === FileAttachmentEntityType.CARGO_RECEIPT,
      ),
      qrCodes: attachments.filter((a) => a.entityType === FileAttachmentEntityType.PAYMENT_QR),
      attachments,
    };
  }

  private async notifyAccountantSubmitted(
    tx: Tx,
    user: AuthUser,
    expense: {
      id: string;
      expenseNumber: string;
      expenseType: TransportExpenseType;
      requestType?: string | null;
      amount: unknown;
      currency: string;
      procurementOrderId?: string | null;
      procurementOrder?: { orderNumber?: string } | null;
    },
    transportCompanyName: string,
    cargo: {
      totalWeightKg: number;
      cargoRateUsdPerKg: number;
      usdExchangeRate: number;
      calculatedAmountUsd: number;
      calculatedAmountKgs: number;
    } | null,
  ) {
    const orderNumber = expense.procurementOrder?.orderNumber;
    const requestLabel =
      expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT
        ? 'China domestic transport'
        : expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
          ? 'Cargo payment'
          : expense.expenseType === TransportExpenseType.LOCAL_DELIVERY
            ? 'Kyrgyzstan domestic transport'
            : 'Transport expense';
    const cargoExtra = cargo
      ? ` Weight: ${cargo.totalWeightKg} kg; Tariff: ${cargo.cargoRateUsdPerKg} USD/kg; USD rate: ${cargo.usdExchangeRate}; Calculated: ${cargo.calculatedAmountKgs.toFixed(2)} KGS.`
      : '';
    await this.notifications.notifyInTx(tx, user, {
      type: AlertType.TRANSPORT_EXPENSE_SUBMITTED,
      entityType: 'ProcurementTransportExpense',
      entityId: expense.id,
      referenceNumber: orderNumber || expense.expenseNumber,
      message: `${requestLabel} request ${expense.expenseNumber}${orderNumber ? ` for order ${orderNumber}` : ''}: ${transportCompanyName}, ${Number(expense.amount).toFixed(2)} ${expense.currency}.${cargoExtra}`,
      recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
    });
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

  syncApprovedSectionCostsInTx(
    tx: Tx,
    user: AuthUser,
    expense: {
      id: string;
      procurementOrderId: string | null;
      expenseType: TransportExpenseType;
      amountKgs: unknown;
    },
  ) {
    return this.syncOrderSectionCostFromApprovedExpenses(tx, user, expense);
  }

  async syncApprovedSectionCostsForExpense(user: AuthUser, expenseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id: expenseId } });
      if (!expense?.procurementOrderId) return { synced: false };
      await this.syncOrderSectionCostFromApprovedExpenses(tx, user, expense);
      return { synced: true, procurementOrderId: expense.procurementOrderId };
    });
  }

  private async syncOrderSectionCostFromApprovedExpenses(
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
        calculatedAmountKgs: true,
        paidAmountKgs: true,
        status: true,
      },
    });

    const estimatedRate =
      order.weightedAverageYuanRate != null && Number(order.totalPaidYuan) > 0
        ? Number(order.weightedAverageYuanRate)
        : Number(order.defaultYuanRate);

    const maxCargoCalculated = siblings.reduce(
      (max, row) => Math.max(max, Number(row.calculatedAmountKgs || 0)),
      0,
    );

    const sectionTotal =
      expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT
        ? Number(order.chinaDomesticTransportYuan || 0)
        : expense.expenseType === TransportExpenseType.LOCAL_DELIVERY
          ? Number(order.localTransportKgs || 0)
          : expense.expenseType === TransportExpenseType.OTHER_LOGISTICS ||
              expense.expenseType === TransportExpenseType.CHINA_WAREHOUSE
            ? Number(order.otherExpenseKgs || 0)
            : expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT
              ? Math.max(Number(order.totalCargoCostKgs || 0), maxCargoCalculated)
              : expense.expenseType === TransportExpenseType.CUSTOMS_BROKER
                ? Number(order.customsCostKgs || 0)
                : 0;

    const section = estimateSectionExpenseCostKgs({
      expenses: siblings.map((row) => ({
        amount: Number(row.amount),
        currency: row.currency,
        exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
        amountKgs: Number(row.amountKgs),
        paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
        status: row.status,
      })),
      sectionTotalAmount: sectionTotal,
      estimatedYuanRate: estimatedRate,
      defaultCurrency:
        expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT ? 'CNY' : 'KGS',
    });

    const confirmedKgs = sumConfirmedExpenseAmountKgs(
      siblings.map((row) => ({
        amount: Number(row.amount),
        currency: row.currency,
        exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
        amountKgs: Number(row.amountKgs || row.calculatedAmountKgs || 0),
        paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
        status: row.status,
      })),
      estimatedRate,
    );

    const data: Prisma.ProcurementOrderUpdateInput = {};
    if (expense.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT) {
      data.chinaDomesticTransportKgs = Math.max(
        confirmedKgs,
        Number(order.chinaDomesticTransportKgs || 0),
      );
    } else if (expense.expenseType === TransportExpenseType.LOCAL_DELIVERY) {
      data.localTransportKgs = Math.max(confirmedKgs, Number(order.localTransportKgs || 0));
    } else if (
      expense.expenseType === TransportExpenseType.OTHER_LOGISTICS ||
      expense.expenseType === TransportExpenseType.CHINA_WAREHOUSE
    ) {
      data.otherExpenseKgs = Math.max(confirmedKgs, Number(order.otherExpenseKgs || 0));
    } else if (expense.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT) {
      const cargoKgs = Math.max(
        confirmedKgs,
        Number(order.totalCargoCostKgs || 0),
        maxCargoCalculated,
      );
      data.chinaExportTransportKgs = cargoKgs;
      data.totalCargoCostKgs = cargoKgs;
    } else if (expense.expenseType === TransportExpenseType.CUSTOMS_BROKER) {
      data.customsCostKgs = Math.max(confirmedKgs, Number(order.customsCostKgs || 0));
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
        customsCostKgs: Number(order.customsCostKgs),
      }, {
        chinaDomesticTransportKgs: Number(updated.chinaDomesticTransportKgs),
        localTransportKgs: Number(updated.localTransportKgs),
        otherExpenseKgs: Number(updated.otherExpenseKgs),
        totalCargoCostKgs: Number(updated.totalCargoCostKgs),
        customsCostKgs: Number(updated.customsCostKgs),
        sourceExpenseId: expense.id,
        sectionTotalAmount: section.sectionTotalAmount,
        estimatedSectionCostKgs: section.estimatedSectionCostKgs,
        confirmedSectionCostKgs: confirmedKgs,
        paidSectionAmount: section.paidAmount,
        expenseType: expense.expenseType,
        note: 'HQ Accountant-approved expenses included in inventory landed cost',
      });
      if (expense.expenseType === TransportExpenseType.LOCAL_DELIVERY && confirmedKgs > 0) {
        await this.audit(tx, user, 'KYRGYZSTAN_TRANSPORT_ALLOCATED', order.id, {
          localTransportKgs: Number(order.localTransportKgs),
        }, {
          procurementOrderId: order.id,
          expenseId: expense.id,
          approvedAmount: confirmedKgs,
          expenseType: expense.expenseType,
          allocationStatus: 'READY_TO_CALCULATE',
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    }

    try {
      await this.landedCostService.recalculateProcurementOrder(
        order.id,
        {
          user,
          reason: 'transport-expense-paid',
          triggerReason: 'transport-expense-paid',
          allowAfterFinalize: true,
        },
        tx,
      );
    } catch {
      // Weight/finalized gates may block recalculation; section totals above remain updated.
    }
  }

  permanentlyDelete(user: AuthUser, id: string, dto: PermanentDeleteHqPaymentDto) {
    if (!canPermanentDeleteBusinessData(user)) {
      throw new ForbiddenException('Only HQ SysAdmin can permanently delete payments');
    }
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.procurementTransportExpense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Transport expense not found');

      const oldInvoiceStatus = expense.status;
      const paidKgs = roundMoney(Number(expense.paidAmountKgs || 0));

      if (paidKgs > 0) {
        await this.assertNoIrreversibleWarehouseOps(tx, expense.procurementOrderId);
        const accountId = expense.financeAccountId;
        if (!accountId) {
          throw new BadRequestException('Paid transport expense is missing finance account linkage');
        }
        const account = await this.assertHqAccount(tx, accountId);
        const reason = dto.reason?.trim() || 'Permanent delete by HQ SysAdmin';
        await this.ledgerService.postLedgerEntry(tx, user, {
          accountId: account.id,
          branchId: null,
          entryType: FinanceLedgerEntryType.ADJUSTMENT,
          amount: paidKgs,
          currency: 'KGS',
          referenceType: 'ProcurementTransportExpensePermanentDeleteReversal',
          referenceId: expense.id,
          notes: `Permanent delete reversal transport expense ${expense.expenseNumber}: ${reason}`,
        });
      }

      await tx.fileAttachment.updateMany({
        where: {
          entityId: expense.id,
          deletedAt: null,
          entityType: {
            in: [
              FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE,
              FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
            ],
          },
        },
        data: { deletedAt: new Date() },
      });

      const orderId = expense.procurementOrderId;
      const expenseType = expense.expenseType;
      await tx.procurementTransportExpense.delete({ where: { id } });

      if (orderId) {
        const anchor = await tx.procurementTransportExpense.findFirst({
          where: { procurementOrderId: orderId, expenseType },
        });
        if (anchor) {
          await this.syncOrderSectionCostFromApprovedExpenses(tx, user, anchor);
        }
      }

      await auditPaymentPermanentlyDeleted(tx, user, {
        paymentId: expense.id,
        paymentType: 'ProcurementTransportExpense',
        paymentNumber: expense.expenseNumber,
        amount: Number(expense.amount),
        currency: expense.currency,
        paymentDate: expense.paidAt?.toISOString() ?? expense.submittedAt?.toISOString() ?? null,
        accountId: expense.financeAccountId,
        cashboxId: expense.financeAccountId,
        invoiceId: orderId ?? null,
        oldInvoiceStatus,
        newInvoiceStatus: 'DELETED',
        reason: dto.reason,
      });

      return {
        success: true,
        deletedPaymentId: expense.id,
        paymentNumber: expense.expenseNumber,
      };
    });
  }

  private async assertNoIrreversibleWarehouseOps(
    tx: Tx,
    procurementOrderId: string | null | undefined,
  ) {
    if (!procurementOrderId) return;
    const receivingCount = await tx.procurementGoodsReceiving.count({
      where: { procurementOrderId, deletedAt: null },
    });
    if (receivingCount > 0) {
      throw new BadRequestException(
        'Невозможно удалить платеж: на основании этого платежа уже выполнена необратимая складская операция.',
      );
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
