import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchInvoiceStatus,
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertCashierPaymentAllowed, getActiveAssignmentAccountIds } from './finance-assignment.util';
import {
  assertAccountUsableByOwner,
  buildSelectableOwnerAccountsWhere,
} from './finance-account-ownership.util';
import {
  BRANCH_CASHIER_RECEIVING_ACCOUNT_AUDIT,
  type BranchCashierReceivingAccountResolution,
  resolveBranchCashierReceivingAccount,
} from './branch-cashier-receiving-account.util';
import { resolveDefaultBranchAccountId } from './branch-payment-posting.repair.util';
import {
  BRANCH_CASHIER_PAYMENT_AUDIT,
  INVOICE_ALREADY_PAID_MESSAGE,
  resolveBranchCashierNetPayment,
  roundCashierMoney,
} from './branch-cashier-payment.util';
import {
  assertPaymentMethodMatchesAccountType,
  BRANCH_CUSTOMER_PAYMENT_AUDIT,
  BRANCH_PAYMENT_POSTING_REQUIRED_MESSAGE,
  paymentRequiresLedgerPosting,
  resolveBranchPaymentNetAmount,
} from './branch-payment-posting.util';
import { FinanceLedgerService } from './finance-ledger.service';

type PrismaTx = Prisma.TransactionClient;

export type CreditBranchCashierAccountInput = {
  accountId: string;
  branchId: string;
  netAcceptedAmount: number;
  paymentId: string;
  invoiceId: string;
  saleId?: string | null;
  paymentMethod?: string;
  receivedAmount?: number | null;
  changeAmount?: number | null;
  notes?: string;
};

@Injectable()
export class BranchCashierPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
  ) {}

  async resolveReceivingAccount(
    user: AuthUser,
    paymentMethod: string,
    options: {
      installmentId?: string;
      invoiceId?: string;
      audit?: boolean;
    } = {},
  ): Promise<BranchCashierReceivingAccountResolution> {
    if (!user.branchId) {
      throw new ForbiddenException('Branch cashier access required');
    }
    if (!paymentMethod?.trim()) {
      throw new BadRequestException('Выберите способ оплаты');
    }

    const where = buildSelectableOwnerAccountsWhere(user, { forPayment: true });
    const assignedAccountIds = await getActiveAssignmentAccountIds(this.prisma, user.id);
    const allowedTypes = resolveAllowedTypesForMethod(paymentMethod);
    if (!allowedTypes?.length) {
      throw new BadRequestException('Неподдерживаемый способ оплаты');
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        ...where,
        ...(assignedAccountIds.size > 0 ? { id: { in: [...assignedAccountIds] } } : {}),
        typeCode: { in: [...allowedTypes] },
      },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        typeCode: true,
        currency: true,
        status: true,
        scope: true,
        branchId: true,
        currentBalance: true,
        availableBalance: true,
      },
      orderBy: [{ name: 'asc' }],
    });

    const assignments = assignedAccountIds.size
      ? await this.prisma.financeAccountAssignment.findMany({
          where: {
            userId: user.id,
            isActive: true,
            accountId: { in: accounts.map((account) => account.id) },
          },
          select: { accountId: true, isPrimary: true },
        })
      : [];
    const primaryByAccountId = new Map(
      assignments.map((assignment) => [assignment.accountId, assignment.isPrimary]),
    );

    const branchDefaultAccountId = await resolveDefaultBranchAccountId(
      this.prisma,
      user.branchId,
      paymentMethod,
    );

    const resolution = resolveBranchCashierReceivingAccount({
      paymentMethod,
      branchDefaultAccountId,
      eligibleAccounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountNumber: account.accountNumber,
        typeCode: account.typeCode,
        currentBalance: Number(account.currentBalance ?? 0),
        availableBalance: Number(account.availableBalance ?? 0),
        isPrimaryAssignment: primaryByAccountId.get(account.id) ?? false,
      })),
    });

    if (options.audit && resolution.status === 'resolved') {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: BRANCH_CASHIER_RECEIVING_ACCOUNT_AUDIT.RECEIVING_ACCOUNT_AUTO_RESOLVED,
          entity: 'FinanceAccount',
          entityId: resolution.account.id,
          metadata: {
            installmentId: options.installmentId ?? null,
            invoiceId: options.invoiceId ?? null,
            branchId: user.branchId,
            paymentMethod,
            accountId: resolution.account.id,
            accountType: resolution.account.typeCode,
            resolution: resolution.resolution,
            actorUserId: user.id,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return resolution;
  }

  async resolveReceivingAccountOrThrow(
    user: AuthUser,
    paymentMethod: string,
    options: {
      installmentId?: string;
      invoiceId?: string;
      clientAccountId?: string | null;
      audit?: boolean;
    } = {},
  ) {
    const resolution = await this.resolveReceivingAccount(user, paymentMethod, {
      installmentId: options.installmentId,
      invoiceId: options.invoiceId,
      audit: options.audit,
    });

    if (resolution.status !== 'resolved') {
      throw new BadRequestException(resolution.message);
    }

    if (
      options.clientAccountId?.trim() &&
      options.clientAccountId.trim() !== resolution.account.id
    ) {
      throw new BadRequestException(
        'Выбранный счёт не соответствует способу оплаты. Обновите страницу и повторите попытку.',
      );
    }

    return resolution.account;
  }

  async listSelectableAccounts(user: AuthUser, paymentMethod?: string) {
    if (!user.branchId) {
      throw new ForbiddenException('Branch cashier access required');
    }

    const where = buildSelectableOwnerAccountsWhere(user, { forPayment: true });
    const assignedAccountIds = await getActiveAssignmentAccountIds(this.prisma, user.id);
    const allowedTypes = paymentMethod
      ? resolveAllowedTypesForMethod(paymentMethod)
      : null;

    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        ...where,
        ...(assignedAccountIds.size > 0 ? { id: { in: [...assignedAccountIds] } } : {}),
        ...(allowedTypes ? { typeCode: { in: [...allowedTypes] } } : {}),
      },
      select: {
        id: true,
        name: true,
        accountNumber: true,
        typeCode: true,
        currency: true,
        status: true,
        scope: true,
        branchId: true,
        currentBalance: true,
        availableBalance: true,
      },
      orderBy: [{ name: 'asc' }],
    });

    return accounts.map((account) => ({
      ...account,
      currentBalance: Number(account.currentBalance ?? 0),
      availableBalance: Number(account.availableBalance ?? 0),
    }));
  }

  async assertCashierFinanceAccount(
    tx: PrismaTx,
    user: AuthUser,
    accountId: string,
    branchId: string,
  ) {
    if (!accountId?.trim()) {
      throw new BadRequestException('Выберите счёт или кассу для зачисления');
    }

    await assertCashierPaymentAllowed(this.prisma, user, {
      accountId,
      branchId,
    });

    const account = await tx.financeAccount.findFirst({
      where: {
        id: accountId,
        deletedAt: null,
        scope: FinanceAccountScope.BRANCH,
        branchId,
        status: FinanceAccountStatus.ACTIVE,
      },
    });
    if (!account) {
      throw new ForbiddenException('Счёт недоступен для кассира филиала');
    }

    assertAccountUsableByOwner(
      user,
      {
        id: account.id,
        scope: account.scope,
        branchId: account.branchId,
        status: account.status,
        deletedAt: account.deletedAt,
      },
      { expectedBranchId: branchId, requireActive: true },
    );

    return account;
  }

  assertPaymentAccountType(
    paymentMethod: string | undefined,
    account: { typeCode: string },
  ) {
    if (!paymentMethod) return;
    assertPaymentMethodMatchesAccountType(paymentMethod, account.typeCode);
  }

  async lockInvoiceForPayment(tx: PrismaTx, invoiceId: string, branchId: string) {
    await tx.$queryRaw`SELECT id FROM "BranchInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.branchInvoice.findFirst({
      where: { id: invoiceId, deletedAt: null, branchId },
    });
    if (!invoice) {
      throw new NotFoundException('Branch invoice not found');
    }
    if (invoice.status === BranchInvoiceStatus.PAID) {
      throw new BadRequestException(INVOICE_ALREADY_PAID_MESSAGE);
    }
    if (invoice.status === BranchInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay cancelled invoice');
    }
    return invoice;
  }

  async findIdempotentPayment(tx: PrismaTx, idempotencyKey?: string | null) {
    if (!idempotencyKey?.trim()) return null;
    return tx.branchPayment.findFirst({
      where: { idempotencyKey: idempotencyKey.trim(), deletedAt: null },
      include: { financeAccount: true },
    });
  }

  async creditAccountForPayment(
    tx: PrismaTx,
    user: AuthUser,
    input: CreditBranchCashierAccountInput,
  ) {
    const netAcceptedAmount = roundCashierMoney(input.netAcceptedAmount);
    if (netAcceptedAmount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    const account = await this.assertCashierFinanceAccount(
      tx,
      user,
      input.accountId,
      input.branchId,
    );
    this.assertPaymentAccountType(input.paymentMethod, account);
    const oldBalance = roundCashierMoney(Number(account.currentBalance));

    const ledgerEntry = await this.ledgerService.postLedgerEntry(tx, user, {
      accountId: account.id,
      branchId: input.branchId,
      entryType: FinanceLedgerEntryType.INCOME,
      amount: netAcceptedAmount,
      currency: account.currency,
      referenceType: 'BranchPayment',
      referenceId: input.paymentId,
      notes:
        input.notes ??
        `Cashier payment invoice ${input.invoiceId}${input.saleId ? ` sale ${input.saleId}` : ''}`,
    });

    const newBalance = roundCashierMoney(Number(ledgerEntry.afterBalance));

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: BRANCH_CUSTOMER_PAYMENT_AUDIT.ACCOUNT_TRANSACTION_CREATED,
        entity: 'FinanceLedgerEntry',
        entityId: ledgerEntry.id,
        metadata: {
          invoiceId: input.invoiceId,
          paymentId: input.paymentId,
          saleId: input.saleId ?? null,
          branchId: input.branchId,
          accountId: account.id,
          paymentMethod: input.paymentMethod ?? null,
          netCreditedAmount: netAcceptedAmount,
          changeAmount: input.changeAmount ?? null,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: BRANCH_CASHIER_PAYMENT_AUDIT.ACCOUNT_BALANCE_INCREASED,
        entity: 'FinanceAccount',
        entityId: account.id,
        metadata: {
          invoiceId: input.invoiceId,
          paymentId: input.paymentId,
          saleId: input.saleId ?? null,
          branchId: input.branchId,
          accountId: account.id,
          oldBalance,
          acceptedAmount: netAcceptedAmount,
          changeAmount: input.changeAmount ?? null,
          netAcceptedAmount,
          newBalance,
          paymentMethod: input.paymentMethod ?? null,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      accountId: account.id,
      ledgerEntryId: ledgerEntry.id,
      oldBalance,
      newBalance,
      currency: account.currency,
    };
  }

  resolveNetPayment(
    input: Parameters<typeof resolveBranchCashierNetPayment>[0],
  ) {
    return resolveBranchCashierNetPayment(input);
  }

  async assertNoDuplicateFullPayment(tx: PrismaTx, invoiceId: string) {
    const existing = await tx.branchPayment.findFirst({
      where: {
        invoiceId,
        deletedAt: null,
        confirmationStatus: 'CONFIRMED',
        ledgerEntryId: { not: null },
      },
    });
    if (existing) {
      throw new ConflictException(INVOICE_ALREADY_PAID_MESSAGE);
    }
  }

  buildPaymentAuditAction(oldStatus: BranchInvoiceStatus, newStatus: BranchInvoiceStatus) {
    if (newStatus === BranchInvoiceStatus.PAID) {
      return BRANCH_CASHIER_PAYMENT_AUDIT.INVOICE_CLOSED;
    }
    if (newStatus === BranchInvoiceStatus.PARTIALLY_PAID) {
      return BRANCH_CASHIER_PAYMENT_AUDIT.INVOICE_PARTIALLY_PAID;
    }
    return BRANCH_CASHIER_PAYMENT_AUDIT.PAYMENT_ACCEPTED;
  }

  assertConfirmedPaymentPosted(
    payment: { ledgerEntryId?: string | null; confirmationStatus: string },
    netAcceptedAmount: number,
  ) {
    if (netAcceptedAmount <= 0) return;
    if (payment.confirmationStatus !== 'CONFIRMED') return;
    if (!payment.ledgerEntryId) {
      throw new BadRequestException(BRANCH_PAYMENT_POSTING_REQUIRED_MESSAGE);
    }
  }

  async assertRetailInvoicePaymentsPosted(tx: PrismaTx, invoiceId: string) {
    const payments = await tx.branchPayment.findMany({
      where: {
        invoiceId,
        deletedAt: null,
        confirmationStatus: 'CONFIRMED',
      },
    });

    for (const payment of payments) {
      const netAcceptedAmount = resolveBranchPaymentNetAmount(payment);
      if (
        paymentRequiresLedgerPosting({
          confirmationStatus: payment.confirmationStatus,
          netAcceptedAmount,
        })
      ) {
        this.assertConfirmedPaymentPosted(payment, netAcceptedAmount);
      }
    }
  }
}

function resolveAllowedTypesForMethod(paymentMethod: string) {
  switch (paymentMethod) {
    case 'CASH':
      return ['CASH', 'PETTY_CASH'] as const;
    case 'QR':
      return ['QR'] as const;
    case 'BANK':
    case 'TRANSFER':
      return ['BANK', 'DEPOSIT'] as const;
    default:
      return null;
  }
}
