import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, FinanceAccountStatus, FinanceReconciliationStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canManageFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { getActiveAssignmentAccountIds } from './finance-assignment.util';
import { buildFinanceDocumentNumber } from './finance-number.util';
import { CreateFinanceReconciliationDto } from './dto/create-finance-reconciliation.dto';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';
import { resolveUserRoles } from '../rbac/rbac';
import {
  assertReconciliationAccountActive,
  calculateReconciliationDifference,
  parseReconciliationActualBalance,
  resolveReconciliationSystemBalance,
} from './finance-reconciliation.util';

@Injectable()
export class FinanceReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listReconciliations(user: AuthUser, query: FinanceReportQueryDto & { status?: FinanceReconciliationStatus }) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const roles = resolveUserRoles(user);
    const assignedAccountIds =
      roles.includes(Role.HQ_CASHIER) && !canManageFinanceAccounts(user)
        ? await getActiveAssignmentAccountIds(this.prisma, user.id)
        : null;

    return this.prisma.financeReconciliation.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(assignedAccountIds ? { accountId: { in: [...assignedAccountIds] } } : {}),
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, currency: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { statementDate: 'desc' },
      take: query.limit ?? 100,
    });
  }

  async createReconciliation(user: AuthUser, dto: CreateFinanceReconciliationDto) {
    const roles = resolveUserRoles(user);
    const isHqCashier = roles.includes(Role.HQ_CASHIER) && !canManageFinanceAccounts(user);
    if (!canManageFinanceAccounts(user) && !isHqCashier) {
      throw new ForbiddenException('Выбранный счёт недоступен.');
    }

    if (dto.actualBalance == null || String(dto.actualBalance).trim() === '') {
      throw new BadRequestException('Введите фактический баланс.');
    }
    const actualBalance = parseReconciliationActualBalance(dto.actualBalance);
    if (actualBalance == null) {
      throw new BadRequestException('Фактический баланс указан неверно.');
    }

    const assignedAccountIds = isHqCashier
      ? await getActiveAssignmentAccountIds(this.prisma, user.id)
      : new Set<string>();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.financeAccount.findFirst({
          where: { id: dto.accountId, deletedAt: null },
        });
        if (!account) throw new NotFoundException('Выбранный счёт недоступен.');

        if (isHqCashier && !assignedAccountIds.has(account.id)) {
          throw new ForbiddenException('Выбранный счёт недоступен.');
        }
        assertCanAccessAccountScope(user, account, assignedAccountIds);
        try {
          assertReconciliationAccountActive(account.status);
        } catch {
          throw new BadRequestException('Выбранный счёт недоступен.');
        }

        const systemBalance = resolveReconciliationSystemBalance(account);
        const difference = calculateReconciliationDifference(actualBalance, systemBalance);
        if (Math.abs(difference) > 0.009 && (!dto.notes || String(dto.notes).trim().length < 3)) {
          throw new BadRequestException('Комментарий обязателен, если разница не равна нулю');
        }
        const status =
          difference === 0 ? FinanceReconciliationStatus.COMPLETED : FinanceReconciliationStatus.DIFFERENCE;

        const reconciliation = await tx.financeReconciliation.create({
          data: {
            reconciliationNumber: buildFinanceDocumentNumber('FRC'),
            accountId: account.id,
            branchId: account.branchId,
            statementDate: dto.statementDate ? new Date(dto.statementDate) : new Date(),
            systemBalance,
            actualBalance,
            difference,
            status,
            notes: dto.notes?.trim() || null,
            attachmentUrl: dto.attachmentUrl,
            createdById: user.id,
            completedAt: status === FinanceReconciliationStatus.COMPLETED ? new Date() : null,
          },
          include: {
            account: { select: { id: true, name: true, accountNumber: true } },
          },
        });

        if (status === FinanceReconciliationStatus.DIFFERENCE) {
          await this.notifications.notify(user, {
            type: AlertType.FINANCE_RECONCILIATION_DIFFERENCE,
            branchId: account.branchId ?? undefined,
            entityType: 'FinanceReconciliation',
            entityId: reconciliation.id,
            referenceNumber: reconciliation.reconciliationNumber,
          });
        }

        await tx.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'HQ_ACCOUNT_RECONCILIATION_CREATED',
            entity: 'FinanceReconciliation',
            entityId: reconciliation.id,
            metadata: {
              accountId: account.id,
              systemBalance,
              actualBalance,
              difference,
              comment: dto.notes?.trim() || null,
              actorUserId: user.id,
              actorRole: user.role,
              timestamp: new Date().toISOString(),
              reconciliationNumber: reconciliation.reconciliationNumber,
            },
          },
        });

        return reconciliation;
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'HQ_ACCOUNT_RECONCILIATION_FAILED',
            entity: 'FinanceAccount',
            entityId: dto.accountId,
            metadata: {
              accountId: dto.accountId,
              actualBalance: dto.actualBalance,
              comment: dto.notes?.trim() || null,
              actorUserId: user.id,
              actorRole: user.role,
              timestamp: new Date().toISOString(),
              reason: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
        throw error;
      }

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'HQ_ACCOUNT_RECONCILIATION_FAILED',
          entity: 'FinanceAccount',
          entityId: dto.accountId,
          metadata: {
            accountId: dto.accountId,
            actualBalance: dto.actualBalance,
            actorUserId: user.id,
            actorRole: user.role,
            timestamp: new Date().toISOString(),
            reason: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });
      throw error;
    }
  }

  async completeReconciliation(user: AuthUser, id: string) {
    const reconciliation = await this.prisma.financeReconciliation.findUnique({ where: { id } });
    if (!reconciliation) throw new NotFoundException('Reconciliation not found');
    if (reconciliation.status === FinanceReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Already completed');
    }

    return this.prisma.financeReconciliation.update({
      where: { id },
      data: {
        status: FinanceReconciliationStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }
}
