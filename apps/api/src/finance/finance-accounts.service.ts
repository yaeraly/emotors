import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserRoles } from '../rbac/rbac';
import {
  assertCanAccessAccountScope,
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  canManageHqFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { AssignFinanceAccountDto, CreateFinanceAccountDto, FinanceAccountQueryDto, SetOpeningBalanceDto, UpdateFinanceAccountDto } from './dto/finance-account.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class FinanceAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
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
    const assignments = await this.prisma.financeAccountAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { accountId: true },
    });
    return new Set(assignments.map((item) => item.accountId));
  }

  private assertAccountVisible<T extends { id: string; branchId: string | null; scope: FinanceAccountScope }>(
    user: AuthUser,
    account: T,
    assignedAccountIds: Set<string>,
  ) {
    assertCanAccessAccountScope(user, account, assignedAccountIds);
    return account;
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
    const isCashierOnly =
      roles.includes(Role.CASHIER) &&
      !canManageFinanceAccounts(user) &&
      !canManageHqFinanceAccounts(user);

    const where: Prisma.FinanceAccountWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.typeCode ? { typeCode: query.typeCode } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(scopeFilter.scope ? { scope: scopeFilter.scope } : {}),
      ...(scopeFilter.branchId !== undefined ? { branchId: scopeFilter.branchId } : {}),
      ...(isCashierOnly
        ? { id: { in: [...assignedAccountIds] } }
        : {}),
    };

    const accounts = await this.prisma.financeAccount.findMany({
      where,
      include: this.accountInclude(),
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    return accounts.map((account) => this.assertAccountVisible(user, account, assignedAccountIds));
  }

  async getAccount(user: AuthUser, id: string) {
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
    return account;
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

      await tx.financeAccount.update({
        where: { id },
        data: {
          openingBalance: amount,
          currentBalance: amount,
          availableBalance: amount,
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

    const cashier = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        branchId: account.branchId,
        deletedAt: null,
        role: Role.CASHIER,
      },
    });
    if (!cashier) {
      throw new BadRequestException('Cashier not found in branch');
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
        assignedById: user.id,
        isActive: true,
      },
      update: {
        isActive: true,
        assignedById: user.id,
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
      data: { isActive: false },
    });

    return assignment;
  }
}
