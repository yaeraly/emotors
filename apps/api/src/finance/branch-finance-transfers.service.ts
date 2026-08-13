import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceAccountScope,
  FinanceAccountStatus,
  FinanceLedgerEntryType,
  FinanceTransferStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import { assertCanAccessAccountScope } from './finance-access.util';
import { getActiveAssignmentAccountIds } from './finance-assignment.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import {
  CreateBranchFinanceTransferDto,
  RejectBranchFinanceTransferDto,
  ReviewBranchFinanceTransferDto,
  UpdateBranchFinanceTransferDto,
} from '../branch-accountant/dto/branch-finance-transfer.dto';

type PrismaTx = Prisma.TransactionClient;

const EDITABLE_BRANCH_TRANSFER_STATUSES = new Set<string>([
  FinanceTransferStatus.PENDING,
  FinanceTransferStatus.REJECTED,
]);

@Injectable()
export class BranchFinanceTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
  ) {}

  private transferInclude() {
    return {
      sourceAccount: {
        include: {
          branch: { select: { id: true, name: true, code: true } },
          typeDefinition: true,
        },
      },
      destinationAccount: {
        include: {
          branch: { select: { id: true, name: true, code: true } },
          typeDefinition: true,
        },
      },
      createdBy: { select: { id: true, fullName: true, role: true } },
      accountant: { select: { id: true, fullName: true, role: true } },
      cashier: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
    };
  }

  private assertBranchCashier(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (!user.branchId || hasAnyFullAccessRole(roles) || !roles.includes(Role.CASHIER)) {
      throw new ForbiddenException('Доступ только для кассира филиала');
    }
  }

  private assertBranchAccountant(user: AuthUser) {
    const roles = resolveUserRoles(user);
    if (!user.branchId || hasAnyFullAccessRole(roles) || !roles.includes(Role.ACCOUNTANT)) {
      throw new ForbiddenException('Доступ только для бухгалтера филиала');
    }
  }

  async listCashierTransfers(user: AuthUser) {
    this.assertBranchCashier(user);
    const rows = await this.prisma.financeTransfer.findMany({
      where: {
        branchId: user.branchId!,
        sourceAccount: { scope: FinanceAccountScope.BRANCH },
        destinationAccount: { scope: FinanceAccountScope.BRANCH },
      },
      include: this.transferInclude(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.serializeTransfer(row));
  }

  async listAccountantTransfers(user: AuthUser, status?: FinanceTransferStatus) {
    this.assertBranchAccountant(user);
    const rows = await this.prisma.financeTransfer.findMany({
      where: {
        branchId: user.branchId!,
        ...(status ? { status } : {}),
        sourceAccount: { scope: FinanceAccountScope.BRANCH },
        destinationAccount: { scope: FinanceAccountScope.BRANCH },
      },
      include: this.transferInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map((row) => this.serializeTransfer(row));
  }

  async createTransfer(user: AuthUser, dto: CreateBranchFinanceTransferDto) {
    this.assertBranchCashier(user);
    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey?.trim()) {
        const existing = await tx.financeTransfer.findFirst({
          where: { idempotencyKey: dto.idempotencyKey.trim() },
          include: this.transferInclude(),
        });
        if (existing) return this.serializeTransfer(existing);
      }

      const { sourceAccount, destinationAccount, amount } = await this.validateBranchAccounts(
        tx,
        user,
        dto.sourceAccountId,
        dto.destinationAccountId,
        Number(dto.amount),
        false,
      );

      const transfer = await tx.financeTransfer.create({
        data: {
          transferNumber: buildFinanceDocumentNumber('BTR'),
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          branchId: user.branchId!,
          amount,
          currency: sourceAccount.currency,
          status: FinanceTransferStatus.PENDING,
          requiresApproval: true,
          reason: dto.reason.trim(),
          createdById: user.id,
          cashierId: user.id,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'BRANCH_TRANSFER_CREATED', transfer.id, {
        transferNumber: transfer.transferNumber,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        amount,
        status: transfer.status,
        reason: transfer.reason,
      });

      return this.serializeTransfer(transfer);
    });
  }

  async updateTransfer(user: AuthUser, id: string, dto: UpdateBranchFinanceTransferDto) {
    this.assertBranchCashier(user);
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockTransfer(tx, id, user.branchId!);
      if (!EDITABLE_BRANCH_TRANSFER_STATUSES.has(existing.status)) {
        throw new BadRequestException('Можно редактировать только ожидающие или отклонённые переводы');
      }

      const sourceAccountId = dto.sourceAccountId ?? existing.sourceAccountId;
      const destinationAccountId = dto.destinationAccountId ?? existing.destinationAccountId;
      const amount = roundMoney(Number(dto.amount ?? existing.amount));
      const reason = dto.reason !== undefined ? dto.reason.trim() : existing.reason;
      if (!reason) {
        throw new BadRequestException('Укажите причину перевода');
      }

      const { sourceAccount, destinationAccount } = await this.validateBranchAccounts(
        tx,
        user,
        sourceAccountId,
        destinationAccountId,
        amount,
        false,
      );

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          amount,
          currency: sourceAccount.currency,
          reason,
          status: FinanceTransferStatus.PENDING,
          returnReason: null,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'BRANCH_TRANSFER_UPDATED', id, {
        sourceAccountId: existing.sourceAccountId,
        destinationAccountId: existing.destinationAccountId,
        amount: Number(existing.amount),
        status: existing.status,
      }, {
        sourceAccountId: updated.sourceAccountId,
        destinationAccountId: updated.destinationAccountId,
        amount: Number(updated.amount),
        status: updated.status,
        reason: updated.reason,
      });

      return this.serializeTransfer(updated);
    });
  }

  async approveTransfer(user: AuthUser, id: string, dto: ReviewBranchFinanceTransferDto = {}) {
    this.assertBranchAccountant(user);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id, user.branchId!);
      if (transfer.status === FinanceTransferStatus.COMPLETED) {
        const refreshed = await tx.financeTransfer.findUniqueOrThrow({
          where: { id },
          include: this.transferInclude(),
        });
        return this.serializeTransfer(refreshed);
      }
      if (transfer.status !== FinanceTransferStatus.PENDING) {
        throw new BadRequestException('Перевод не ожидает одобрения');
      }
      if (dto.expectedVersion != null && dto.expectedVersion !== transfer.version) {
        throw new ConflictException('Перевод был изменён другим пользователем. Обновите страницу.');
      }

      const amount = roundMoney(Number(transfer.amount));
      await this.validateBranchAccounts(
        tx,
        user,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        amount,
        true,
      );

      await this.postTransferLedgerEntries(
        tx,
        user,
        transfer.id,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        amount,
        transfer.currency,
        user.branchId!,
      );

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.COMPLETED,
          accountantId: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          completedAt: new Date(),
          notes: dto.comment?.trim() || transfer.notes,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'BRANCH_TRANSFER_APPROVED', id, {
        status: transfer.status,
        amount,
      }, {
        status: updated.status,
        amount,
        sourceAccountId: updated.sourceAccountId,
        destinationAccountId: updated.destinationAccountId,
        accountantId: user.id,
      });

      return this.serializeTransfer(updated);
    });
  }

  async rejectTransfer(user: AuthUser, id: string, dto: RejectBranchFinanceTransferDto) {
    this.assertBranchAccountant(user);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id, user.branchId!);
      if (transfer.status !== FinanceTransferStatus.PENDING) {
        throw new BadRequestException('Перевод не ожидает одобрения');
      }
      if (dto.expectedVersion != null && dto.expectedVersion !== transfer.version) {
        throw new ConflictException('Перевод был изменён другим пользователем. Обновите страницу.');
      }

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.REJECTED,
          returnReason: dto.reason.trim(),
          accountantId: user.id,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'BRANCH_TRANSFER_REJECTED', id, {
        status: transfer.status,
      }, {
        status: updated.status,
        returnReason: updated.returnReason,
        accountantId: user.id,
      });

      return this.serializeTransfer(updated);
    });
  }

  private async validateBranchAccounts(
    tx: PrismaTx,
    user: AuthUser,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    requireBalance: boolean,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Сумма должна быть больше нуля');
    }
    if (sourceAccountId === destinationAccountId) {
      throw new BadRequestException('Счёт списания и счёт зачисления не могут совпадать.');
    }

    const [sourceAccount, destinationAccount] = await Promise.all([
      tx.financeAccount.findFirst({ where: { id: sourceAccountId, deletedAt: null } }),
      tx.financeAccount.findFirst({ where: { id: destinationAccountId, deletedAt: null } }),
    ]);
    if (!sourceAccount || !destinationAccount) {
      throw new NotFoundException('Счёт не найден');
    }

    for (const account of [sourceAccount, destinationAccount]) {
      if (account.scope !== FinanceAccountScope.BRANCH || account.branchId !== user.branchId) {
        throw new ForbiddenException('Доступны только счета текущего филиала');
      }
      if (account.status !== FinanceAccountStatus.ACTIVE) {
        throw new BadRequestException('Оба счёта должны быть активными');
      }
    }

    if (sourceAccount.currency !== destinationAccount.currency) {
      throw new BadRequestException('Валюта счетов должна совпадать');
    }

    const assignedAccountIds = await getActiveAssignmentAccountIds(this.prisma, user.id);
    assertCanAccessAccountScope(user, sourceAccount, assignedAccountIds);
    assertCanAccessAccountScope(user, destinationAccount, assignedAccountIds);

    if (requireBalance && amount > Number(sourceAccount.availableBalance) + 0.009) {
      throw new BadRequestException(`Недостаточно средств на счёте ${sourceAccount.name}`);
    }

    return {
      sourceAccount,
      destinationAccount,
      amount: roundMoney(amount),
    };
  }

  private async postTransferLedgerEntries(
    tx: PrismaTx,
    user: AuthUser,
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    branchId: string,
  ) {
    await this.ledgerService.postLedgerEntry(tx, user, {
      accountId: sourceAccountId,
      branchId,
      entryType: FinanceLedgerEntryType.TRANSFER_OUT,
      amount,
      currency,
      transferId,
      referenceType: 'FinanceTransfer',
      referenceId: transferId,
    });

    await this.ledgerService.postLedgerEntry(tx, user, {
      accountId: destinationAccountId,
      branchId,
      entryType: FinanceLedgerEntryType.TRANSFER_IN,
      amount,
      currency,
      transferId,
      referenceType: 'FinanceTransfer',
      referenceId: transferId,
    });
  }

  private async lockTransfer(tx: PrismaTx, id: string, branchId: string) {
    await tx.$queryRaw`SELECT id FROM "FinanceTransfer" WHERE id = ${id} FOR UPDATE`;
    const transfer = await tx.financeTransfer.findFirst({
      where: {
        id,
        branchId,
        sourceAccount: { scope: FinanceAccountScope.BRANCH },
        destinationAccount: { scope: FinanceAccountScope.BRANCH },
      },
      include: {
        sourceAccount: true,
        destinationAccount: true,
      },
    });
    if (!transfer) {
      throw new NotFoundException('Перевод не найден');
    }
    return transfer;
  }

  private async audit(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue?: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'FinanceTransfer',
        entityId,
        metadata: {
          branchId: user.branchId,
          actorUserId: user.id,
          timestamp: new Date().toISOString(),
          oldValue: oldValue as Prisma.InputJsonValue,
          ...(newValue ? { newValue: newValue as Prisma.InputJsonValue } : {}),
        },
      },
    });
  }

  private serializeTransfer(transfer: any) {
    return {
      ...transfer,
      amount: Number(transfer.amount),
      sourceAccount: transfer.sourceAccount
        ? {
            ...transfer.sourceAccount,
            currentBalance: Number(transfer.sourceAccount.currentBalance),
            availableBalance: Number(transfer.sourceAccount.availableBalance),
          }
        : transfer.sourceAccount,
      destinationAccount: transfer.destinationAccount
        ? {
            ...transfer.destinationAccount,
            currentBalance: Number(transfer.destinationAccount.currentBalance),
            availableBalance: Number(transfer.destinationAccount.availableBalance),
          }
        : transfer.destinationAccount,
    };
  }
}
