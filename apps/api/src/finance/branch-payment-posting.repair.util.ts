import {
  BranchInvoiceCategory,
  BranchPaymentConfirmationStatus,
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import {
  assertPaymentMethodMatchesAccountType,
  BRANCH_CUSTOMER_PAYMENT_AUDIT,
  reconcileConfirmedPaymentPosting,
  resolveAllowedAccountTypeCodes,
  resolveBranchPaymentNetAmount,
} from './branch-payment-posting.util';

type PrismaTx = Prisma.TransactionClient;

export type MissingPostingRepairRow = {
  saleId: string;
  saleNumber: string;
  invoiceId: string;
  paymentId: string;
  branchId: string;
  paymentMethod: string;
  saleTotal: number;
  confirmedPaymentTotal: number;
  accountId: string | null;
  accountType: string | null;
  existingAccountTransactionId: string | null;
  existingLedgerEntryId: string | null;
  existingBalanceEffect: number;
  expectedBalanceEffect: number;
  difference: number;
  repairAction: string;
};

export type SalePaymentPostingTrace = {
  saleId: string;
  saleNumber: string;
  branchId: string;
  customerId: string;
  saleTotal: number;
  saleStatus: string;
  paymentType: string | null;
  paymentStatus: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceTotal: number | null;
  invoicePaidAmount: number | null;
  invoiceRemainingAmount: number | null;
  payments: Array<{
    paymentId: string;
    paymentAmount: number;
    paymentMethod: string;
    paymentStatus: string;
    accountId: string | null;
    accountType: string | null;
    accountOwnerType: string | null;
    accountBranchId: string | null;
    ledgerEntryId: string | null;
    confirmedBy: string | null;
    confirmedAt: string | null;
  }>;
  repairRows: MissingPostingRepairRow[];
};

export async function loadSalePaymentPostingTrace(
  prisma: PrismaClient,
  saleNumber: string,
): Promise<SalePaymentPostingTrace | null> {
  const sale = await prisma.sale.findFirst({
    where: { receiptNumber: saleNumber, deletedAt: null },
    include: {
      branchInvoice: {
        include: {
          payments: {
            where: { deletedAt: null },
            include: {
              financeAccount: true,
              confirmedBy: { select: { id: true, fullName: true, role: true } },
            },
            orderBy: { confirmedAt: 'desc' },
          },
        },
      },
    },
  });

  if (!sale) return null;

  const invoice = sale.branchInvoice;
  const repairRows = invoice
    ? await buildMissingPostingRepairRows(prisma, sale, invoice)
    : [];

  return {
    saleId: sale.id,
    saleNumber: sale.receiptNumber,
    branchId: sale.branchId,
    customerId: sale.customerId,
    saleTotal: roundMoney(Number(sale.totalAmount)),
    saleStatus: sale.status,
    paymentType: sale.paymentType,
    paymentStatus: sale.paymentStatus,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceTotal: invoice ? roundMoney(Number(invoice.totalAmount)) : null,
    invoicePaidAmount: invoice ? roundMoney(Number(invoice.paidAmount)) : null,
    invoiceRemainingAmount: invoice ? roundMoney(Number(invoice.debtAmount)) : null,
    payments: (invoice?.payments ?? []).map((payment) => ({
      paymentId: payment.id,
      paymentAmount: roundMoney(Number(payment.amount)),
      paymentMethod: payment.method,
      paymentStatus: payment.confirmationStatus,
      accountId: payment.financeAccountId,
      accountType: payment.financeAccount?.typeCode ?? null,
      accountOwnerType: payment.financeAccount?.scope ?? null,
      accountBranchId: payment.financeAccount?.branchId ?? null,
      ledgerEntryId: payment.ledgerEntryId,
      confirmedBy: payment.confirmedBy?.fullName ?? payment.confirmedById,
      confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    })),
    repairRows,
  };
}

export async function buildMissingPostingRepairRows(
  prisma: PrismaClient | PrismaTx,
  sale: { id: string; receiptNumber: string; branchId: string; totalAmount: Prisma.Decimal },
  invoice: {
    id: string;
    branchId: string;
    invoiceCategory: BranchInvoiceCategory;
    payments: Array<{
      id: string;
      branchId: string;
      method: string;
      amount: Prisma.Decimal;
      netAcceptedAmount: Prisma.Decimal | null;
      receivedAmount: Prisma.Decimal | null;
      changeAmount: Prisma.Decimal | null;
      confirmationStatus: BranchPaymentConfirmationStatus;
      financeAccountId: string | null;
      ledgerEntryId: string | null;
      financeAccount?: { id: string; typeCode: string; currentBalance: Prisma.Decimal } | null;
    }>;
  },
  overrideAccountId?: string,
): Promise<MissingPostingRepairRow[]> {
  const rows: MissingPostingRepairRow[] = [];

  for (const payment of invoice.payments) {
    if (payment.confirmationStatus !== BranchPaymentConfirmationStatus.CONFIRMED) {
      continue;
    }

    const confirmedPaymentTotal = resolveBranchPaymentNetAmount(payment);
    if (confirmedPaymentTotal <= 0) continue;

    let existingBalanceEffect = 0;
    if (payment.ledgerEntryId) {
      const ledger = await prisma.financeLedgerEntry.findUnique({
        where: { id: payment.ledgerEntryId },
        select: { signedAmount: true },
      });
      existingBalanceEffect = roundMoney(Number(ledger?.signedAmount ?? 0));
    }

    const reconciliation = reconcileConfirmedPaymentPosting({
      netAcceptedAmount: confirmedPaymentTotal,
      ledgerSignedAmount: existingBalanceEffect,
      balanceDelta: existingBalanceEffect,
    });

    if (reconciliation.matches) {
      rows.push({
        saleId: sale.id,
        saleNumber: sale.receiptNumber,
        invoiceId: invoice.id,
        paymentId: payment.id,
        branchId: invoice.branchId,
        paymentMethod: payment.method,
        saleTotal: roundMoney(Number(sale.totalAmount)),
        confirmedPaymentTotal,
        accountId: payment.financeAccountId,
        accountType: payment.financeAccount?.typeCode ?? null,
        existingAccountTransactionId: payment.ledgerEntryId,
        existingLedgerEntryId: payment.ledgerEntryId,
        existingBalanceEffect,
        expectedBalanceEffect: confirmedPaymentTotal,
        difference: reconciliation.difference,
        repairAction: 'none',
      });
      continue;
    }

    const accountId =
      overrideAccountId ??
      payment.financeAccountId ??
      (await resolveDefaultBranchAccountId(prisma, invoice.branchId, payment.method));

    let accountType: string | null = payment.financeAccount?.typeCode ?? null;
    if (accountId && !accountType) {
      const account = await prisma.financeAccount.findFirst({
        where: { id: accountId, deletedAt: null },
        select: { typeCode: true },
      });
      accountType = account?.typeCode ?? null;
    }

    rows.push({
      saleId: sale.id,
      saleNumber: sale.receiptNumber,
      invoiceId: invoice.id,
      paymentId: payment.id,
      branchId: invoice.branchId,
      paymentMethod: payment.method,
      saleTotal: roundMoney(Number(sale.totalAmount)),
      confirmedPaymentTotal,
      accountId,
      accountType,
      existingAccountTransactionId: payment.ledgerEntryId,
      existingLedgerEntryId: payment.ledgerEntryId,
      existingBalanceEffect,
      expectedBalanceEffect: confirmedPaymentTotal,
      difference: reconciliation.difference,
      repairAction: accountId ? 'post_missing_ledger_entry' : 'missing_account_selection',
    });
  }

  return rows;
}

export async function resolveDefaultBranchAccountId(
  prisma: PrismaClient | PrismaTx,
  branchId: string,
  paymentMethod: string,
): Promise<string | null> {
  const allowedTypes = [...resolveAllowedAccountTypeCodes(paymentMethod)];
  if (!allowedTypes.length) return null;

  const accounts = await prisma.financeAccount.findMany({
    where: {
      deletedAt: null,
      scope: FinanceAccountScope.BRANCH,
      branchId,
      status: FinanceAccountStatus.ACTIVE,
      typeCode: { in: allowedTypes },
    },
    select: { id: true, typeCode: true, name: true },
    orderBy: [{ name: 'asc' }],
  });

  if (accounts.length === 1) {
    return accounts[0].id;
  }

  return null;
}

export async function applyMissingPostingRepair(
  tx: PrismaTx,
  row: MissingPostingRepairRow,
  actorUserId: string,
  actorRole: string,
) {
  if (row.repairAction === 'none') {
    return { applied: false, reason: 'already_posted' as const };
  }
  if (row.repairAction !== 'post_missing_ledger_entry' || !row.accountId) {
    return { applied: false, reason: 'missing_account' as const };
  }

  const payment = await tx.branchPayment.findFirst({
    where: { id: row.paymentId, deletedAt: null },
    include: { financeAccount: true },
  });
  if (!payment) {
    return { applied: false, reason: 'payment_not_found' as const };
  }
  if (payment.ledgerEntryId) {
    return { applied: false, reason: 'already_posted' as const };
  }

  const account = await tx.financeAccount.findFirst({
    where: {
      id: row.accountId,
      deletedAt: null,
      scope: FinanceAccountScope.BRANCH,
      branchId: row.branchId,
      status: FinanceAccountStatus.ACTIVE,
    },
  });
  if (!account) {
    return { applied: false, reason: 'account_not_found' as const };
  }

  assertPaymentMethodMatchesAccountType(payment.method, account.typeCode);

  const netAcceptedAmount = resolveBranchPaymentNetAmount(payment);
  const oldBalance = roundMoney(Number(account.currentBalance));

  await tx.$queryRaw`SELECT id FROM "FinanceAccount" WHERE id = ${account.id} FOR UPDATE`;

  const entry = await tx.financeLedgerEntry.create({
    data: {
      entryNumber: buildFinanceDocumentNumber('FLE'),
      accountId: account.id,
      branchId: row.branchId,
      entryType: FinanceLedgerEntryType.INCOME,
      amount: netAcceptedAmount,
      signedAmount: netAcceptedAmount,
      beforeBalance: oldBalance,
      afterBalance: roundMoney(oldBalance + netAcceptedAmount),
      currency: account.currency,
      referenceType: 'BranchPayment',
      referenceId: payment.id,
      notes: `Repair missing branch payment posting for sale ${row.saleNumber}`,
      createdById: actorUserId,
    },
  });

  const aggregate = await tx.financeLedgerEntry.aggregate({
    where: { accountId: account.id },
    _sum: { signedAmount: true },
  });
  const newBalance = roundMoney(Number(aggregate._sum.signedAmount ?? 0));
  const pendingBalance = roundMoney(Number(account.pendingBalance ?? 0));

  await tx.financeAccount.update({
    where: { id: account.id },
    data: {
      currentBalance: newBalance,
      availableBalance: roundMoney(newBalance - pendingBalance),
    },
  });

  await tx.branchPayment.update({
    where: { id: payment.id },
    data: {
      financeAccountId: account.id,
      ledgerEntryId: entry.id,
      netAcceptedAmount: payment.netAcceptedAmount ?? netAcceptedAmount,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      role: actorRole,
      action: BRANCH_CUSTOMER_PAYMENT_AUDIT.MISSING_POSTING_REPAIRED,
      entity: 'BranchPayment',
      entityId: payment.id,
      metadata: {
        saleId: row.saleId,
        saleNumber: row.saleNumber,
        invoiceId: row.invoiceId,
        paymentId: row.paymentId,
        branchId: row.branchId,
        accountId: account.id,
        paymentMethod: row.paymentMethod,
        oldBalance,
        paymentAmount: netAcceptedAmount,
        netCreditedAmount: netAcceptedAmount,
        newBalance,
        actorUserId,
        actorRole,
        timestamp: new Date().toISOString(),
        reason: 'repair-missing-branch-payment-posting.ts',
        ledgerEntryId: entry.id,
      },
    },
  });

  return {
    applied: true,
    reason: 'posted' as const,
    ledgerEntryId: entry.id,
    oldBalance,
    newBalance,
  };
}
