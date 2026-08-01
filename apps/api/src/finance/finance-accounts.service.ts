import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserRoles, isBranchOwnerUser } from '../rbac/rbac';
import {
  DEFAULT_CASHIER_ASSIGNMENT_OPERATIONS,
  hasCashierCapability,
} from '../rbac/cashier-capability.util';
import {
  assertCanAccessAccountScope,
  canApproveFinanceAccountLifecycle,
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  canManageHqFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import {
  ACCOUNT_OWNERSHIP_AUDIT,
  assertFinanceAccountOwnershipInvariant,
  resolveFinanceAccountOwner,
} from './finance-account-ownership.util';
import { getActiveAssignmentAccountIds, listCashierEligibleEmployees } from './finance-assignment.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { AssignFinanceAccountDto, CreateFinanceAccountDto, FinanceAccountQueryDto, SetOpeningBalanceDto, UpdateFinanceAccountDto } from './dto/finance-account.dto';

type PrismaTx = Prisma.TransactionClient;

const BLOCKED_STATUSES: FinanceAccountStatus[] = [
  FinanceAccountStatus.BLOCKED,
  FinanceAccountStatus.INACTIVE,
];

const ARCHIVED_VISIBILITY_STATUSES: FinanceAccountStatus[] = [
  FinanceAccountStatus.ARCHIVE_REQUESTED,
  FinanceAccountStatus.ARCHIVED,
];

function isBlockedStatus(status: FinanceAccountStatus) {
  return BLOCKED_STATUSES.includes(status);
}

function normalizeStatusWrite(status: FinanceAccountStatus) {
  // Prefer BLOCKED going forward; keep INACTIVE readable for legacy filters.
  return status === FinanceAccountStatus.INACTIVE ? FinanceAccountStatus.BLOCKED : status;
}

@Injectable()
export class FinanceAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  private accountInclude() {
    return {
      typeDefinition: true,
      branch: { select: { id: true, name: true, code: true } },
      assignments: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
    };
  }

  private async getAssignedAccountIds(user: AuthUser) {
    return getActiveAssignmentAccountIds(this.prisma, user.id);
  }

  private async accountHasUsageHistory(accountId: string) {
    const [
      ledgerCount,
      paymentCount,
      investmentCount,
      transferOutCount,
      transferInCount,
      expenseCount,
      reconciliationCount,
      procurementIntendedCount,
      procurementActualCount,
      transportExpenseCount,
      shiftCount,
    ] = await Promise.all([
      this.prisma.financeLedgerEntry.count({ where: { accountId } }),
      this.prisma.payment.count({ where: { financeAccountId: accountId } }),
      this.prisma.financeInvestment.count({ where: { accountId, deletedAt: null } }),
      this.prisma.financeTransfer.count({ where: { sourceAccountId: accountId } }),
      this.prisma.financeTransfer.count({ where: { destinationAccountId: accountId } }),
      this.prisma.financeExpense.count({ where: { accountId } }),
      this.prisma.financeReconciliation.count({ where: { accountId } }),
      this.prisma.procurementSupplierPayment.count({ where: { intendedFinanceAccountId: accountId } }),
      this.prisma.procurementSupplierPayment.count({ where: { actualFinanceAccountId: accountId } }),
      this.prisma.procurementTransportExpense.count({ where: { financeAccountId: accountId } }),
      this.prisma.cashierShift.count({ where: { accountId } }),
    ]);

    return (
      ledgerCount +
        paymentCount +
        investmentCount +
        transferOutCount +
        transferInCount +
        expenseCount +
        reconciliationCount +
        procurementIntendedCount +
        procurementActualCount +
        transportExpenseCount +
        shiftCount >
      0
    );
  }

  private async writeAccountAudit(
    user: AuthUser,
    action: string,
    account: {
      id: string;
      branchId: string | null;
      accountNumber: string;
      currentBalance?: unknown;
      scope?: FinanceAccountScope;
    },
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'FinanceAccount',
        entityId: account.id,
        metadata: {
          accountId: account.id,
          ownerType: account.scope ?? null,
          branchId: account.branchId,
          userId: user.id,
          employeeId: user.id,
          role: user.role,
          amount: Number(account.currentBalance ?? 0),
          transactionNumber: account.accountNumber,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  }

  async listCashierEligibleEmployees(user: AuthUser, branchId?: string) {
    if (!canManageFinanceAccounts(user)) {
      throw new ForbiddenException('Forbidden');
    }
    if (branchId) {
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Branch isolation violation');
      }
      return listCashierEligibleEmployees(this.prisma, branchId);
    }
    if (user.branchId) {
      return listCashierEligibleEmployees(this.prisma, user.branchId);
    }
    // HQ finance managers list HQ cashiers for HQ account assignment (no branch).
    return listCashierEligibleEmployees(this.prisma, null);
  }

  private assertAccountVisible<T extends { id: string; branchId: string | null; scope: FinanceAccountScope }>(
    user: AuthUser,
    account: T,
    assignedAccountIds: Set<string>,
  ) {
    assertCanAccessAccountScope(user, account, assignedAccountIds);
    return this.toAccountResponse(account);
  }

  private toAccountResponse<T extends Record<string, any>>(account: T) {
    return {
      ...account,
      openingBalance: Number(account.openingBalance ?? 0),
      currentBalance: Number(account.currentBalance ?? 0),
      availableBalance: Number(account.availableBalance ?? 0),
      pendingBalance: Number(account.pendingBalance ?? 0),
    };
  }

  async listAccountTypes() {
    return this.prisma.financeAccountTypeDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async listAccounts(user: AuthUser, query: FinanceAccountQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const assignedAccountIds = await this.getAssignedAccountIds(user);
    const roles = resolveUserRoles(user);
    const restrictToAssigned =
      (hasCashierCapability(user) || roles.includes(Role.HQ_CASHIER)) &&
      !canManageFinanceAccounts(user) &&
      !isBranchOwnerUser(user);

    const statusFilter: Prisma.FinanceAccountWhereInput =
      query.status === FinanceAccountStatus.INACTIVE || query.status === FinanceAccountStatus.BLOCKED
        ? { status: { in: BLOCKED_STATUSES } }
        : query.status
          ? { status: query.status }
          : {};

    const where: Prisma.FinanceAccountWhereInput = {
      deletedAt: null,
      ...statusFilter,
      ...(query.typeCode ? { typeCode: query.typeCode } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(scopeFilter.scope ? { scope: scopeFilter.scope } : {}),
      ...(scopeFilter.branchId !== undefined ? { branchId: scopeFilter.branchId } : {}),
      ...(restrictToAssigned
        ? {
            id: { in: [...assignedAccountIds] },
            // Active cashier lists: assigned ACTIVE accounts only (no blocked/archived/draft).
            status: FinanceAccountStatus.ACTIVE,
          }
        : {}),
    };

    const accounts = await this.prisma.financeAccount.findMany({
      where,
      include: this.accountInclude(),
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    // Repair drift so investment (and all other) ledger credits are visible everywhere.
    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.syncAccountBalances(
        tx,
        accounts.map((account) => account.id),
      );
    });

    const refreshed = await this.prisma.financeAccount.findMany({
      where: { id: { in: accounts.map((account) => account.id) } },
      include: {
        ...this.accountInclude(),
        reconciliations: {
          orderBy: { statementDate: 'desc' },
          take: 1,
          select: { statementDate: true, completedAt: true, createdAt: true },
        },
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    const ledgerTotals = await this.prisma.financeLedgerEntry.groupBy({
      by: ['accountId'],
      where: { accountId: { in: refreshed.map((account) => account.id) } },
      _sum: { signedAmount: true },
    });
    const incomingTotals = await this.prisma.financeLedgerEntry.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: refreshed.map((account) => account.id) },
        signedAmount: { gt: 0 },
      },
      _sum: { signedAmount: true },
    });
    const outgoingTotals = await this.prisma.financeLedgerEntry.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: refreshed.map((account) => account.id) },
        signedAmount: { lt: 0 },
      },
      _sum: { signedAmount: true },
    });

    const ledgerMap = new Map(ledgerTotals.map((row) => [row.accountId, Number(row._sum.signedAmount ?? 0)]));
    const incomingMap = new Map(incomingTotals.map((row) => [row.accountId, Number(row._sum.signedAmount ?? 0)]));
    const outgoingMap = new Map(
      outgoingTotals.map((row) => [row.accountId, Math.abs(Number(row._sum.signedAmount ?? 0))]),
    );

    return refreshed.map((account) => {
      const base = this.assertAccountVisible(user, account, assignedAccountIds);
      const lastReconciliation = account.reconciliations?.[0];
      const totalIncoming = roundMoney(incomingMap.get(account.id) ?? 0);
      const totalOutgoing = roundMoney(outgoingMap.get(account.id) ?? 0);
      const expectedClosingBalance = roundMoney(
        Number(account.availableBalance ?? account.currentBalance ?? ledgerMap.get(account.id) ?? 0),
      );
      return {
        ...base,
        totalIncoming,
        totalOutgoing,
        expectedClosingBalance,
        lastReconciliationAt: lastReconciliation
          ? (lastReconciliation.completedAt || lastReconciliation.statementDate || lastReconciliation.createdAt).toISOString()
          : null,
      };
    });
  }

  async getAccount(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ledgerService.recalculateAccountBalance(tx, id);
    });

    const account = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.accountInclude(),
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            createdBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    this.assertAccountVisible(user, account, await this.getAssignedAccountIds(user));
    return this.toAccountResponse({
      ...account,
      ledgerEntries: (account.ledgerEntries ?? []).map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
        signedAmount: Number(entry.signedAmount),
        beforeBalance: Number(entry.beforeBalance),
        afterBalance: Number(entry.afterBalance),
      })),
    });
  }

  async createAccount(user: AuthUser, dto: CreateFinanceAccountDto) {
    if (!canManageFinanceAccounts(user)) {
      throw new ForbiddenException('Forbidden');
    }

    const typeDefinition = await this.prisma.financeAccountTypeDefinition.findFirst({
      where: { code: dto.typeCode, isActive: true },
    });
    if (!typeDefinition) {
      throw new BadRequestException('Unknown account type');
    }

    const { scope, branchId } = resolveFinanceAccountOwner({
      scope: dto.scope,
      branchId: dto.branchId,
      userBranchId: user.branchId,
    });

    if (scope === FinanceAccountScope.HQ && !canManageHqFinanceAccounts(user)) {
      throw new ForbiddenException('Only HQ finance can create HQ accounts');
    }
    if (scope === FinanceAccountScope.BRANCH) {
      if (!canManageBranchFinanceAccounts(user) && !canManageHqFinanceAccounts(user)) {
        throw new ForbiddenException('Forbidden');
      }
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Branch isolation violation');
      }
    }

    if (dto.responsibleEmployeeId) {
      const responsible = await this.prisma.user.findFirst({
        where: { id: dto.responsibleEmployeeId, deletedAt: null },
        select: { id: true, branchId: true },
      });
      if (!responsible) {
        throw new BadRequestException('Responsible employee not found');
      }
      if (scope === FinanceAccountScope.BRANCH && responsible.branchId !== branchId) {
        throw new BadRequestException('Responsible employee must belong to the account branch');
      }
      if (scope === FinanceAccountScope.HQ && responsible.branchId != null) {
        throw new BadRequestException('HQ account responsible employee must be an HQ employee');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.financeAccount.create({
        data: {
          accountNumber: buildFinanceDocumentNumber('FAC'),
          name: dto.name.trim(),
          scope,
          branchId,
          typeCode: dto.typeCode,
          currency: dto.currency ?? 'KGS',
          // HQ accounts start as Draft; Accountant activates. Branch accounts stay Active.
          status:
            scope === FinanceAccountScope.HQ
              ? FinanceAccountStatus.DRAFT
              : FinanceAccountStatus.ACTIVE,
          bankName: dto.bankName,
          bankAccountNo: dto.bankAccountNo,
          iban: dto.iban,
          responsibleEmployeeId: dto.responsibleEmployeeId,
          qrProvider: dto.qrProvider,
          qrMerchantId: dto.qrMerchantId,
          posTerminalId: dto.posTerminalId,
          notes: dto.notes,
          createdById: user.id,
          updatedById: user.id,
        },
        include: this.accountInclude(),
      });

      assertFinanceAccountOwnershipInvariant(account);

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'finance.account.create',
          entity: 'FinanceAccount',
          entityId: account.id,
          metadata: {
            accountId: account.id,
            ownerType: account.scope,
            branchId,
            userId: user.id,
            ownershipAction: ACCOUNT_OWNERSHIP_AUDIT.CREATED,
            employeeId: user.id,
            role: user.role,
            operation: 'CREATE_ACCOUNT',
            amount: 0,
            transactionNumber: account.accountNumber,
            previousValue: null,
            newValue: { status: account.status, name: account.name, scope: account.scope },
            timestamp: new Date().toISOString(),
          },
        },
      });

      return account;
    });
  }

  async updateAccount(user: AuthUser, id: string, dto: UpdateFinanceAccountDto) {
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    assertFinanceAccountOwnershipInvariant(existing);
    if (user.branchId && existing.branchId && user.branchId !== existing.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    if (existing.scope === FinanceAccountScope.HQ && !canManageHqFinanceAccounts(user) && !canApproveFinanceAccountLifecycle(user)) {
      throw new ForbiddenException('Only HQ finance can edit HQ accounts');
    }
    if (
      existing.scope === FinanceAccountScope.BRANCH &&
      !canManageBranchFinanceAccounts(user) &&
      !canManageHqFinanceAccounts(user)
    ) {
      throw new ForbiddenException('Forbidden');
    }
    if (
      existing.status === FinanceAccountStatus.ARCHIVED ||
      existing.status === FinanceAccountStatus.ARCHIVE_REQUESTED
    ) {
      throw new BadRequestException('Archived or archive-requested accounts cannot be edited');
    }

    // Ownership is immutable after creation — never allow scope/branchId changes here.
    if (dto.responsibleEmployeeId) {
      const responsible = await this.prisma.user.findFirst({
        where: { id: dto.responsibleEmployeeId, deletedAt: null },
        select: { id: true, branchId: true },
      });
      if (!responsible) {
        throw new BadRequestException('Responsible employee not found');
      }
      if (
        existing.scope === FinanceAccountScope.BRANCH &&
        responsible.branchId !== existing.branchId
      ) {
        throw new BadRequestException('Responsible employee must belong to the account branch');
      }
      if (existing.scope === FinanceAccountScope.HQ && responsible.branchId != null) {
        throw new BadRequestException('HQ account responsible employee must be an HQ employee');
      }
    }

    const previousValue = {
      name: existing.name,
      bankName: existing.bankName,
      bankAccountNo: existing.bankAccountNo,
      iban: existing.iban,
      responsibleEmployeeId: existing.responsibleEmployeeId,
      qrProvider: existing.qrProvider,
      qrMerchantId: existing.qrMerchantId,
      posTerminalId: existing.posTerminalId,
      notes: existing.notes,
    };

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        bankName: dto.bankName,
        bankAccountNo: dto.bankAccountNo,
        iban: dto.iban,
        responsibleEmployeeId: dto.responsibleEmployeeId,
        qrProvider: dto.qrProvider,
        qrMerchantId: dto.qrMerchantId,
        posTerminalId: dto.posTerminalId,
        notes: dto.notes,
        updatedById: user.id,
      },
      include: this.accountInclude(),
    });

    assertFinanceAccountOwnershipInvariant(account);

    await this.writeAccountAudit(user, 'finance.account.edit', account, {
      operation: 'EDIT_ACCOUNT',
      ownershipAction: ACCOUNT_OWNERSHIP_AUDIT.UPDATED,
      previousValue,
      newValue: {
        name: account.name,
        bankName: account.bankName,
        bankAccountNo: account.bankAccountNo,
        iban: account.iban,
        responsibleEmployeeId: account.responsibleEmployeeId,
        qrProvider: account.qrProvider,
        qrMerchantId: account.qrMerchantId,
        posTerminalId: account.posTerminalId,
        notes: account.notes,
      },
    });

    return account;
  }

  async setAccountStatus(user: AuthUser, id: string, status: FinanceAccountStatus) {
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    if (user.branchId && existing.branchId && user.branchId !== existing.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    const nextStatus = normalizeStatusWrite(status);
    const previousStatus = existing.status;

    if (ARCHIVED_VISIBILITY_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Use archive approve/restore endpoints for archived accounts');
    }

    if (nextStatus === FinanceAccountStatus.ACTIVE) {
      if (
        existing.status !== FinanceAccountStatus.DRAFT &&
        !isBlockedStatus(existing.status) &&
        existing.status !== FinanceAccountStatus.ACTIVE
      ) {
        throw new BadRequestException('Account cannot be activated from current status');
      }
    } else if (nextStatus === FinanceAccountStatus.BLOCKED) {
      if (existing.status !== FinanceAccountStatus.ACTIVE && !isBlockedStatus(existing.status)) {
        throw new BadRequestException('Only active accounts can be blocked');
      }
    } else {
      throw new BadRequestException('Unsupported status transition');
    }

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: { status: nextStatus, updatedById: user.id },
      include: this.accountInclude(),
    });

    const action =
      nextStatus === FinanceAccountStatus.ACTIVE
        ? 'finance.account.activate'
        : 'finance.account.block';

    await this.writeAccountAudit(user, action, account, {
      operation: nextStatus,
      previousValue: { status: previousStatus },
      newValue: { status: nextStatus },
    });

    return account;
  }

  /**
   * Accountant "Delete":
   * - unused accounts → soft-delete (deletedAt)
   * - used accounts → Archive Requested (CEO approval required)
   */
  async deleteOrRequestArchive(user: AuthUser, id: string) {
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    if (user.branchId && existing.branchId && user.branchId !== existing.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    if (existing.status === FinanceAccountStatus.ARCHIVED) {
      throw new BadRequestException('Account is already archived');
    }
    if (existing.status === FinanceAccountStatus.ARCHIVE_REQUESTED) {
      return this.toAccountResponse(existing);
    }

    const hasHistory = await this.accountHasUsageHistory(id);
    if (!hasHistory) {
      const deleted = await this.prisma.financeAccount.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user.id },
        include: this.accountInclude(),
      });
      await this.writeAccountAudit(user, 'finance.account.delete', deleted, {
        operation: 'SOFT_DELETE_UNUSED',
        ownershipAction: ACCOUNT_OWNERSHIP_AUDIT.DELETED,
        previousValue: { status: existing.status, deletedAt: null },
        newValue: { status: deleted.status, deletedAt: deleted.deletedAt },
      });
      return this.toAccountResponse(deleted);
    }

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: { status: FinanceAccountStatus.ARCHIVE_REQUESTED, updatedById: user.id },
      include: this.accountInclude(),
    });

    await this.writeAccountAudit(user, 'finance.account.archive_requested', account, {
      operation: 'ARCHIVE_REQUESTED',
      previousValue: { status: existing.status },
      newValue: { status: FinanceAccountStatus.ARCHIVE_REQUESTED },
    });

    return this.toAccountResponse(account);
  }

  async approveArchive(user: AuthUser, id: string) {
    if (!canApproveFinanceAccountLifecycle(user)) {
      throw new ForbiddenException('Only CEO can approve account archival');
    }
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (existing.status !== FinanceAccountStatus.ARCHIVE_REQUESTED) {
      throw new BadRequestException('Account is not pending archive approval');
    }

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: { status: FinanceAccountStatus.ARCHIVED, updatedById: user.id },
      include: this.accountInclude(),
    });

    await this.writeAccountAudit(user, 'finance.account.archive_approved', account, {
      operation: 'ARCHIVE_APPROVED',
      previousValue: { status: existing.status },
      newValue: { status: FinanceAccountStatus.ARCHIVED },
    });

    return this.toAccountResponse(account);
  }

  async restoreAccount(user: AuthUser, id: string) {
    if (!canApproveFinanceAccountLifecycle(user)) {
      throw new ForbiddenException('Only CEO can restore archived accounts');
    }
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (
      existing.status !== FinanceAccountStatus.ARCHIVED &&
      existing.status !== FinanceAccountStatus.ARCHIVE_REQUESTED
    ) {
      throw new BadRequestException('Only archived or archive-requested accounts can be restored');
    }

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: { status: FinanceAccountStatus.ACTIVE, updatedById: user.id },
      include: this.accountInclude(),
    });

    await this.writeAccountAudit(user, 'finance.account.archive_restored', account, {
      operation: 'ARCHIVE_RESTORED',
      previousValue: { status: existing.status },
      newValue: { status: FinanceAccountStatus.ACTIVE },
    });

    return this.toAccountResponse(account);
  }

  async setOpeningBalance(user: AuthUser, id: string, dto: SetOpeningBalanceDto) {
    const existing = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    if (user.branchId && existing.branchId && user.branchId !== existing.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    const amount = roundMoney(Number(dto.amount));
    if (amount < 0) throw new BadRequestException('Opening balance cannot be negative');

    return this.prisma.$transaction(async (tx) => {
      const entryCount = await tx.financeLedgerEntry.count({ where: { accountId: id } });
      if (entryCount > 0) {
        throw new BadRequestException('Opening balance can only be set before transactions');
      }

      // Persist openingBalance metadata only — ledger post is the balance source of truth.
      await tx.financeAccount.update({
        where: { id },
        data: {
          openingBalance: amount,
          currentBalance: 0,
          availableBalance: 0,
          pendingBalance: 0,
          updatedById: user.id,
        },
      });

      await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: id,
        branchId: existing.branchId,
        entryType: FinanceLedgerEntryType.OPENING_BALANCE,
        amount,
        currency: existing.currency,
        notes: dto.notes,
      });

      return tx.financeAccount.findUniqueOrThrow({
        where: { id },
        include: this.accountInclude(),
      });
    });
  }

  async assignAccount(user: AuthUser, id: string, dto: AssignFinanceAccountDto) {
    const account = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    if (user.branchId && account.branchId && user.branchId !== account.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }
    if (
      account.status === FinanceAccountStatus.ARCHIVED ||
      account.status === FinanceAccountStatus.ARCHIVE_REQUESTED ||
      isBlockedStatus(account.status)
    ) {
      throw new BadRequestException('Cannot assign cashiers to blocked or archived accounts');
    }

    const eligibleBranchId =
      account.scope === FinanceAccountScope.HQ ? null : account.branchId;
    if (account.scope === FinanceAccountScope.BRANCH && !account.branchId) {
      throw new BadRequestException('Branch account is missing branch');
    }
    const eligible = await listCashierEligibleEmployees(this.prisma, eligibleBranchId);
    if (!eligible.some((employee) => employee.id === dto.userId)) {
      throw new BadRequestException(
        account.scope === FinanceAccountScope.HQ
          ? 'Employee must be an active HQ Cashier before account assignment'
          : 'Employee must have active cashier permission before account assignment',
      );
    }

    const allowedOperations =
      dto.allowedOperations?.length ? dto.allowedOperations : [...DEFAULT_CASHIER_ASSIGNMENT_OPERATIONS];

    if (dto.isPrimary) {
      await this.prisma.financeAccountAssignment.updateMany({
        where: { userId: dto.userId, isActive: true, accountId: { not: id } },
        data: { isPrimary: false },
      });
    }

    const assignment = await this.prisma.financeAccountAssignment.upsert({
      where: {
        accountId_userId: {
          accountId: id,
          userId: dto.userId,
        },
      },
      create: {
        accountId: id,
        userId: dto.userId,
        branchId: account.branchId,
        assignedById: user.id,
        isActive: true,
        isPrimary: dto.isPrimary ?? false,
        allowedOperations,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      update: {
        isActive: true,
        branchId: account.branchId,
        assignedById: user.id,
        isPrimary: dto.isPrimary ?? false,
        allowedOperations,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        account: { select: { id: true, name: true, accountNumber: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.account.assign',
        entity: 'FinanceAccountAssignment',
        entityId: assignment.id,
        metadata: {
          accountId: id,
          branchId: account.branchId,
          employeeId: user.id,
          role: user.role,
          operation: 'ASSIGN_CASHIER',
          assignedUserId: dto.userId,
          transactionNumber: account.accountNumber,
          previousValue: null,
          newValue: {
            userId: dto.userId,
            isPrimary: assignment.isPrimary,
            isActive: assignment.isActive,
          },
        },
      },
    });

    await this.notifications.notify(user, {
      type: AlertType.FINANCE_ACCOUNT_ASSIGNED,
      branchId: account.branchId ?? undefined,
      entityType: 'FinanceAccount',
      entityId: account.id,
      referenceNumber: account.accountNumber,
    });

    return assignment;
  }

  async unassignAccount(user: AuthUser, id: string, userId: string) {
    const account = await this.prisma.financeAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (!canManageFinanceAccounts(user)) throw new ForbiddenException('Forbidden');
    if (user.branchId && account.branchId && user.branchId !== account.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    const assignment = await this.prisma.financeAccountAssignment.update({
      where: {
        accountId_userId: {
          accountId: id,
          userId,
        },
      },
      data: { isActive: false, endDate: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.account.unassign',
        entity: 'FinanceAccountAssignment',
        entityId: assignment.id,
        metadata: {
          accountId: id,
          branchId: account.branchId,
          employeeId: user.id,
          role: user.role,
          operation: 'UNASSIGN_CASHIER',
          assignedUserId: userId,
          transactionNumber: account.accountNumber,
        },
      },
    });

    await this.notifications.notify(user, {
      type: AlertType.FINANCE_ACCOUNT_UNASSIGNED,
      branchId: account.branchId ?? undefined,
      entityType: 'FinanceAccount',
      entityId: account.id,
      referenceNumber: account.accountNumber,
    });

    return assignment;
  }
}
