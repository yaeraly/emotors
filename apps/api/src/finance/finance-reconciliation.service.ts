import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, FinanceReconciliationStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canManageFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { CreateFinanceReconciliationDto } from './dto/create-finance-reconciliation.dto';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';

@Injectable()
export class FinanceReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listReconciliations(user: AuthUser, query: FinanceReportQueryDto & { status?: FinanceReconciliationStatus }) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    return this.prisma.financeReconciliation.findMany({
      where: {
        ...(scopeFilter.branchId ? { branchId: scopeFilter.branchId } : {}),
        ...(query.status ? { status: query.status } : {}),
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
    if (!canManageFinanceAccounts(user)) {
      throw new ForbiddenException('Forbidden');
    }

    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    assertCanAccessAccountScope(user, account);

    const systemBalance = roundMoney(Number(account.currentBalance));
    const actualBalance = roundMoney(Number(dto.actualBalance));
    const difference = roundMoney(actualBalance - systemBalance);
    const status =
      difference === 0 ? FinanceReconciliationStatus.COMPLETED : FinanceReconciliationStatus.DIFFERENCE;

    const reconciliation = await this.prisma.financeReconciliation.create({
      data: {
        reconciliationNumber: buildFinanceDocumentNumber('FRC'),
        accountId: account.id,
        branchId: account.branchId,
        statementDate: dto.statementDate ? new Date(dto.statementDate) : new Date(),
        systemBalance,
        actualBalance,
        difference,
        status,
        notes: dto.notes,
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

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.reconciliation.create',
        entity: 'FinanceReconciliation',
        entityId: reconciliation.id,
        metadata: {
          accountId: account.id,
          branchId: account.branchId,
          difference,
          transactionNumber: reconciliation.reconciliationNumber,
        },
      },
    });

    return reconciliation;
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
