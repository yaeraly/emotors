import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  FinanceAccountScope,
  FinanceLedgerEntryType,
  FinanceTransferStatus,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canApproveFinanceTransfer,
  canManageFinanceAccounts,
  isHqFinanceUser,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { CreateFinanceTransferDto, FinanceTransferQueryDto } from './dto/finance-transfer.dto';

@Injectable()
export class FinanceTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly notifications: NotificationsService,
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
      createdBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      ledgerEntries: true,
    };
  }

  async listTransfers(user: AuthUser, query: FinanceTransferQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const where: Prisma.FinanceTransferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(scopeFilter.branchId
        ? {
            OR: [
              { branchId: scopeFilter.branchId },
              { sourceAccount: { branchId: scopeFilter.branchId } },
              { destinationAccount: { branchId: scopeFilter.branchId } },
            ],
          }
        : {}),
    };

    return this.prisma.financeTransfer.findMany({
      where,
      include: this.transferInclude(),
      orderBy: { transferDate: 'desc' },
      take: query.limit ?? 100,
    });
  }

  async getTransfer(user: AuthUser, id: string) {
    const transfer = await this.prisma.financeTransfer.findUnique({
      where: { id },
      include: this.transferInclude(),
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    assertCanAccessAccountScope(user, transfer.sourceAccount);
    assertCanAccessAccountScope(user, transfer.destinationAccount);
    return transfer;
  }

  async createTransfer(user: AuthUser, dto: CreateFinanceTransferDto) {
    if (!canManageFinanceAccounts(user) && !isHqFinanceUser(user)) {
      throw new ForbiddenException('Forbidden');
    }

    const amount = roundMoney(Number(dto.amount));
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');

    const [sourceAccount, destinationAccount] = await Promise.all([
      this.prisma.financeAccount.findFirst({
        where: { id: dto.sourceAccountId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.financeAccount.findFirst({
        where: { id: dto.destinationAccountId, deletedAt: null, status: 'ACTIVE' },
      }),
    ]);

    if (!sourceAccount || !destinationAccount) {
      throw new NotFoundException('Source or destination account not found');
    }
    if (sourceAccount.id === destinationAccount.id) {
      throw new BadRequestException('Source and destination must differ');
    }
    if (sourceAccount.currency !== destinationAccount.currency) {
      throw new BadRequestException('Currency mismatch between accounts');
    }

    assertCanAccessAccountScope(user, sourceAccount);
    assertCanAccessAccountScope(user, destinationAccount);

    const isCrossScope =
      sourceAccount.scope !== destinationAccount.scope ||
      sourceAccount.branchId !== destinationAccount.branchId;
    const requiresApproval = dto.requiresApproval ?? isCrossScope;

    if (user.branchId) {
      if (sourceAccount.branchId && sourceAccount.branchId !== user.branchId) {
        throw new ForbiddenException('Branch isolation violation');
      }
      if (destinationAccount.branchId && destinationAccount.branchId !== user.branchId) {
        throw new ForbiddenException('Branch isolation violation');
      }
    }

    const branchId =
      sourceAccount.scope === FinanceAccountScope.BRANCH
        ? sourceAccount.branchId
        : destinationAccount.branchId;

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.financeTransfer.create({
        data: {
          transferNumber: buildFinanceDocumentNumber('FTR'),
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          branchId,
          amount,
          currency: sourceAccount.currency,
          transferDate: dto.transferDate ? new Date(dto.transferDate) : new Date(),
          status: requiresApproval ? FinanceTransferStatus.PENDING : FinanceTransferStatus.COMPLETED,
          requiresApproval,
          notes: dto.notes,
          createdById: user.id,
          approvedById: requiresApproval ? null : user.id,
          approvedAt: requiresApproval ? null : new Date(),
        },
      });

      if (!requiresApproval) {
        await this.completeTransferEntries(tx, user, transfer.id, sourceAccount.id, destinationAccount.id, amount, sourceAccount.currency, branchId);
      } else {
        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.FINANCE_TRANSFER_PENDING,
          branchId: branchId ?? undefined,
          entityType: 'FinanceTransfer',
          entityId: transfer.id,
          referenceNumber: transfer.transferNumber,
        });
      }

      return tx.financeTransfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: this.transferInclude(),
      });
    });
  }

  async approveTransfer(user: AuthUser, id: string) {
    if (!canApproveFinanceTransfer(user)) {
      throw new ForbiddenException('Forbidden');
    }

    const transfer = await this.prisma.financeTransfer.findUnique({
      where: { id },
      include: {
        sourceAccount: true,
        destinationAccount: true,
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== FinanceTransferStatus.PENDING) {
      throw new BadRequestException('Transfer is not pending approval');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.completeTransferEntries(
        tx,
        user,
        transfer.id,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        Number(transfer.amount),
        transfer.currency,
        transfer.branchId,
      );

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.COMPLETED,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: this.transferInclude(),
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_TRANSFER_APPROVED,
        branchId: transfer.branchId ?? undefined,
        entityType: 'FinanceTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
      });

      return updated;
    });
  }

  private async completeTransferEntries(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    branchId: string | null,
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

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.transfer.complete',
        entity: 'FinanceTransfer',
        entityId: transferId,
        metadata: {
          branchId,
          employeeId: user.id,
          role: user.role,
          operation: 'TRANSFER',
          amount,
          transactionNumber: transferId,
        },
      },
    });
  }
}
