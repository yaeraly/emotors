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
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  canManageHqFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { getActiveAssignmentAccountIds, listCashierEligibleEmployees } from './finance-assignment.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { AssignFinanceAccountDto, CreateFinanceAccountDto, FinanceAccountQueryDto, SetOpeningBalanceDto, UpdateFinanceAccountDto } from './dto/finance-account.dto';

type PrismaTx = Prisma.TransactionClient;

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

    const where: Prisma.FinanceAccountWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.typeCode ? { typeCode: query.typeCode } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(scopeFilter.scope ? { scope: scopeFilter.scope } : {}),
      ...(scopeFilter.branchId !== undefined ? { branchId: scopeFilter.branchId } : {}),
      ...(restrictToAssigned ? { id: { in: [...assignedAccountIds] } } : {}),
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

    const scope = dto.scope ?? (user.branchId ? FinanceAccountScope.BRANCH : FinanceAccountScope.HQ);
    const branchId = scope === FinanceAccountScope.BRANCH ? (dto.branchId ?? user.branchId) : null;

    if (scope === FinanceAccountScope.HQ && !canManageHqFinanceAccounts(user)) {
      throw new ForbiddenException('Only HQ finance can create HQ accounts');
    }
    if (scope === FinanceAccountScope.BRANCH) {
      if (!branchId) throw new BadRequestException('Branch is required');
      if (!canManageBranchFinanceAccounts(user) && !canManageHqFinanceAccounts(user)) {
        throw new ForbiddenException('Forbidden');
      }
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Branch isolation violation');
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
          bankName: dto.bankName,
          bankAccountNo: dto.bankAccountNo,
          qrProvider: dto.qrProvider,
          qrMerchantId: dto.qrMerchantId,
          posTerminalId: dto.posTerminalId,
          notes: dto.notes,
          createdById: user.id,
          updatedById: user.id,
        },
        include: this.accountInclude(),
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'finance.account.create',
          entity: 'FinanceAccount',
          entityId: account.id,
          metadata: {
            accountId: account.id,
            branchId,
            employeeId: user.id,
            role: user.role,
            operation: 'CREATE_ACCOUNT',
            amount: 0,
            transactionNumber: account.accountNumber,
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
    if (user.branchId && existing.branchId && user.branchId !== existing.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    return this.prisma.financeAccount.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        bankName: dto.bankName,
        bankAccountNo: dto.bankAccountNo,
        qrProvider: dto.qrProvider,
        qrMerchantId: dto.qrMerchantId,
        posTerminalId: dto.posTerminalId,
        notes: dto.notes,
        updatedById: user.id,
      },
      include: this.accountInclude(),
    });
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

    const account = await this.prisma.financeAccount.update({
      where: { id },
      data: { status, updatedById: user.id },
      include: this.accountInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: status === FinanceAccountStatus.ACTIVE ? 'finance.account.activate' : 'finance.account.deactivate',
        entity: 'FinanceAccount',
        entityId: account.id,
        metadata: {
          accountId: account.id,
          branchId: account.branchId,
          employeeId: user.id,
          role: user.role,
          operation: status,
          amount: Number(account.currentBalance),
          transactionNumber: account.accountNumber,
        },
      },
    });

    return account;
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
