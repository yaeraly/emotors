import {
  BadRequestException,
  ConflictException,
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
  FinanceTransferStatus,
  NotificationModule,
  Prisma,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  auditReceiptEvent,
  deliverReceiptsToCreatorInTx,
  resolveInvoiceCreatorUserId,
} from '../procurement/receipt-delivery.util';
import { hasAnyFullAccessRole, resolveUserRoles } from '../rbac/rbac';
import {
  assertCanAccessAccountScope,
  assertBranchTransferIsolation,
  canCancelFinanceTransfer,
  canConfirmFinanceTransfer,
  canPrepareFinanceTransfer,
  canReturnFinanceTransfer,
  canReverseFinanceTransfer,
  isHqFinanceUser,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { getActiveAssignmentAccountIds } from './finance-assignment.util';
import { FinanceLedgerService } from './finance-ledger.service';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import {
  ConfirmFinanceTransferDto,
  CreateFinanceTransferDto,
  FinanceTransferQueryDto,
  ReturnFinanceTransferDto,
  ReverseFinanceTransferDto,
  UpdateFinanceTransferDto,
} from './dto/finance-transfer.dto';

type Tx = Prisma.TransactionClient;

const EDITABLE_STATUSES = new Set<string>([
  FinanceTransferStatus.DRAFT,
  FinanceTransferStatus.RETURNED,
]);

const AWAITING_CASHIER_STATUSES = new Set<string>([
  FinanceTransferStatus.PENDING_CASHIER,
  FinanceTransferStatus.PENDING,
]);

/** Configurable CEO large-transfer threshold (KGS). */
const LARGE_TRANSFER_THRESHOLD_KGS = Number(process.env.FINANCE_TRANSFER_LARGE_THRESHOLD_KGS || 500000);

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
      createdBy: { select: { id: true, fullName: true, role: true } },
      accountant: { select: { id: true, fullName: true, role: true } },
      cashier: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      returnedBy: { select: { id: true, fullName: true, role: true } },
      ledgerEntries: true,
    };
  }

  async listTransfers(user: AuthUser, query: FinanceTransferQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const roles = resolveUserRoles(user);
    const cashierOnly =
      roles.includes(Role.HQ_CASHIER) &&
      !hasAnyFullAccessRole(roles) &&
      !roles.includes(Role.FINANCE_MANAGER) &&
      !roles.includes(Role.HQ_ACCOUNTANT);

    const where: Prisma.FinanceTransferWhereInput = {
      ...(query.status
        ? { status: query.status }
        : cashierOnly
          ? {
              status: {
                in: [
                  FinanceTransferStatus.PENDING_CASHIER,
                  FinanceTransferStatus.PENDING,
                  FinanceTransferStatus.COMPLETED,
                ],
              },
            }
          : {}),
      ...(query.sourceAccountId ? { sourceAccountId: query.sourceAccountId } : {}),
      ...(query.destinationAccountId ? { destinationAccountId: query.destinationAccountId } : {}),
      ...(query.accountantId ? { accountantId: query.accountantId } : {}),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.from || query.to
        ? {
            transferDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(scopeFilter.branchId
        ? {
            OR: [
              { branchId: scopeFilter.branchId },
              { sourceAccount: { branchId: scopeFilter.branchId } },
              { destinationAccount: { branchId: scopeFilter.branchId } },
            ],
          }
        : {}),
      ...(cashierOnly
        ? {
            sourceAccount: { scope: FinanceAccountScope.HQ },
            destinationAccount: { scope: FinanceAccountScope.HQ },
          }
        : {}),
    };

    const rows = await this.prisma.financeTransfer.findMany({
      where,
      include: this.transferInclude(),
      orderBy: { transferDate: 'desc' },
      take: query.limit ?? 100,
    });
    return Promise.all(rows.map((row) => this.toTransferResponse(row)));
  }

  async listCashierQueue(user: AuthUser) {
    if (!canConfirmFinanceTransfer(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('You do not have permission to view the transfer cashier queue');
    }
    const roles = resolveUserRoles(user);
    const restrictToAssigned =
      roles.includes(Role.HQ_CASHIER) && !hasAnyFullAccessRole(roles) && !isHqFinanceUser(user);
    const assignedAccountIds = restrictToAssigned
      ? await getActiveAssignmentAccountIds(this.prisma, user.id)
      : null;
    const assignedIds = assignedAccountIds ? [...assignedAccountIds] : [];
    const rows = await this.prisma.financeTransfer.findMany({
      where: {
        status: { in: [FinanceTransferStatus.PENDING_CASHIER, FinanceTransferStatus.PENDING] },
        sourceAccount: { scope: FinanceAccountScope.HQ },
        destinationAccount: { scope: FinanceAccountScope.HQ },
        ...(restrictToAssigned
          ? {
              sourceAccountId: { in: assignedIds },
              destinationAccountId: { in: assignedIds },
            }
          : {}),
      },
      include: this.transferInclude(),
      orderBy: [{ sentToCashierAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return Promise.all(rows.map((row) => this.toTransferResponse(row)));
  }

  async getTransfer(user: AuthUser, id: string) {
    const transfer = await this.prisma.financeTransfer.findUnique({
      where: { id },
      include: this.transferInclude(),
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    const assignedAccountIds = await getActiveAssignmentAccountIds(this.prisma, user.id);
    assertBranchTransferIsolation(user, transfer);
    assertCanAccessAccountScope(user, transfer.sourceAccount, assignedAccountIds);
    assertCanAccessAccountScope(user, transfer.destinationAccount, assignedAccountIds);
    return this.toTransferResponse(transfer);
  }

  createTransfer(user: AuthUser, dto: CreateFinanceTransferDto) {
    if (!canPrepareFinanceTransfer(user)) {
      throw new ForbiddenException('Only HQ Accountant can prepare finance transfers');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.financeTransfer.findFirst({
          where: { idempotencyKey: dto.idempotencyKey },
          include: this.transferInclude(),
        });
        if (existing) return this.toTransferResponse(existing);
      }

      const { sourceAccount, destinationAccount, amount } = await this.validateAccounts(
        tx,
        user,
        dto.sourceAccountId,
        dto.destinationAccountId,
        Number(dto.amount),
      );

      const sendToCashier = dto.sendToCashier === true;
      if (sendToCashier && !dto.reason?.trim()) {
        throw new BadRequestException('Transfer reason is required before sending to cashier');
      }

      const transfer = await tx.financeTransfer.create({
        data: {
          transferNumber: buildFinanceDocumentNumber('FTR'),
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          branchId: null,
          amount,
          currency: sourceAccount.currency,
          transferDate: dto.transferDate ? new Date(dto.transferDate) : new Date(),
          status: sendToCashier
            ? FinanceTransferStatus.PENDING_CASHIER
            : FinanceTransferStatus.DRAFT,
          requiresApproval: true,
          reason: dto.reason?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: user.id,
          accountantId: user.id,
          sentToCashierAt: sendToCashier ? new Date() : null,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'finance.transfer.created', transfer.id, null, {
        transferNumber: transfer.transferNumber,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        amount,
        status: transfer.status,
        reason: transfer.reason,
      });

      if (sendToCashier) {
        await this.afterSentToCashier(tx, user, transfer);
      }

      return this.toTransferResponse(transfer);
    });
  }

  updateTransfer(user: AuthUser, id: string, dto: UpdateFinanceTransferDto) {
    if (!canPrepareFinanceTransfer(user)) {
      throw new ForbiddenException('Only HQ Accountant can edit finance transfers');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockTransfer(tx, id);
      if (!EDITABLE_STATUSES.has(existing.status) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
        throw new BadRequestException('Only draft or returned transfers can be edited');
      }

      const sourceAccountId = dto.sourceAccountId ?? existing.sourceAccountId;
      const destinationAccountId = dto.destinationAccountId ?? existing.destinationAccountId;
      const amount = roundMoney(Number(dto.amount ?? existing.amount));
      const { sourceAccount, destinationAccount } = await this.validateAccounts(
        tx,
        user,
        sourceAccountId,
        destinationAccountId,
        amount,
      );

      const sendToCashier = dto.sendToCashier === true;
      const reason = dto.reason !== undefined ? dto.reason?.trim() || null : existing.reason;
      if (sendToCashier && !reason) {
        throw new BadRequestException('Transfer reason is required before sending to cashier');
      }

      const oldValue = {
        status: existing.status,
        amount: Number(existing.amount),
        sourceAccountId: existing.sourceAccountId,
        destinationAccountId: existing.destinationAccountId,
        reason: existing.reason,
      };

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          amount,
          currency: sourceAccount.currency,
          transferDate: dto.transferDate ? new Date(dto.transferDate) : existing.transferDate,
          reason,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : existing.notes,
          accountantId: existing.accountantId ?? user.id,
          status: sendToCashier
            ? FinanceTransferStatus.PENDING_CASHIER
            : existing.status === FinanceTransferStatus.RETURNED
              ? FinanceTransferStatus.DRAFT
              : existing.status,
          sentToCashierAt: sendToCashier ? new Date() : existing.sentToCashierAt,
          returnReason: sendToCashier ? null : existing.returnReason,
          returnedAt: sendToCashier ? null : existing.returnedAt,
          returnedById: sendToCashier ? null : existing.returnedById,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'finance.transfer.edited', id, oldValue, {
        status: updated.status,
        amount: Number(updated.amount),
        sourceAccountId: updated.sourceAccountId,
        destinationAccountId: updated.destinationAccountId,
        reason: updated.reason,
      });

      if (sendToCashier) {
        await this.afterSentToCashier(tx, user, updated);
      }

      return this.toTransferResponse(updated);
    });
  }

  sendToCashier(user: AuthUser, id: string) {
    if (!canPrepareFinanceTransfer(user)) {
      throw new ForbiddenException('Only HQ Accountant can submit transfers to cashier');
    }
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id);
      if (!EDITABLE_STATUSES.has(transfer.status)) {
        throw new BadRequestException('Only draft or returned transfers can be sent to cashier');
      }
      if (!transfer.reason?.trim()) {
        throw new BadRequestException('Transfer reason is required');
      }
      await this.validateAccounts(
        tx,
        user,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        Number(transfer.amount),
      );

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.PENDING_CASHIER,
          sentToCashierAt: new Date(),
          accountantId: transfer.accountantId ?? user.id,
          returnReason: null,
          returnedAt: null,
          returnedById: null,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.afterSentToCashier(tx, user, updated);
      return this.toTransferResponse(updated);
    });
  }

  returnToAccountant(user: AuthUser, id: string, dto: ReturnFinanceTransferDto) {
    if (!canReturnFinanceTransfer(user)) {
      throw new ForbiddenException('Only HQ Cashier can return transfers');
    }
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id);
      if (!AWAITING_CASHIER_STATUSES.has(transfer.status)) {
        throw new BadRequestException('Transfer is not awaiting cashier confirmation');
      }
      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.RETURNED,
          returnReason: dto.reason.trim(),
          returnedAt: new Date(),
          returnedById: user.id,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'finance.transfer.returned', id, {
        status: transfer.status,
      }, {
        status: updated.status,
        returnReason: updated.returnReason,
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_TRANSFER_RETURNED,
        entityType: 'FinanceTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        message: `Transfer ${transfer.transferNumber} was returned: ${dto.reason.trim()}`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER],
      });

      return this.toTransferResponse(updated);
    });
  }

  confirmTransfer(user: AuthUser, id: string, dto: ConfirmFinanceTransferDto) {
    if (!canConfirmFinanceTransfer(user)) {
      throw new ForbiddenException('Only HQ Cashier can confirm finance transfers');
    }

    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id);

      if (transfer.status === FinanceTransferStatus.COMPLETED) {
        throw new ConflictException('Transfer is already completed');
      }
      if (!AWAITING_CASHIER_STATUSES.has(transfer.status)) {
        throw new BadRequestException('Transfer is not awaiting cashier confirmation');
      }
      if (dto.expectedVersion != null && dto.expectedVersion !== transfer.version) {
        throw new ConflictException('Transfer was updated by another user; refresh and retry');
      }

      const receiptCount = await tx.fileAttachment.count({
        where: {
          entityType: FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT,
          entityId: transfer.id,
          deletedAt: null,
        },
      });
      if (receiptCount <= 0) {
        throw new BadRequestException('Transfer receipt attachment is required');
      }

      const amount = Number(transfer.amount);
      await this.validateAccounts(
        tx,
        user,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        amount,
        true,
      );

      await this.completeTransferEntries(
        tx,
        user,
        transfer.id,
        transfer.sourceAccountId,
        transfer.destinationAccountId,
        amount,
        transfer.currency,
        null,
      );

      const updated = await tx.financeTransfer.update({
        where: { id },
        data: {
          status: FinanceTransferStatus.COMPLETED,
          cashierId: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          completedAt: new Date(),
          transferDate: dto.transferDate ? new Date(dto.transferDate) : transfer.transferDate,
          transactionNumber: dto.transactionNumber?.trim() || transfer.transactionNumber,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : transfer.notes,
          version: { increment: 1 },
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'finance.transfer.completed', id, {
        status: transfer.status,
      }, {
        status: updated.status,
        amount,
        sourceAccountId: updated.sourceAccountId,
        destinationAccountId: updated.destinationAccountId,
        transactionNumber: updated.transactionNumber,
        cashierId: user.id,
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_TRANSFER_COMPLETED,
        entityType: 'FinanceTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        message: `Transfer ${transfer.transferNumber} completed for ${amount} ${transfer.currency}.`,
        recipientRoles: [Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER, Role.CEO, Role.OWNER],
      });

      const creatorUserId = resolveInvoiceCreatorUserId({
        transferCreatedById: transfer.createdById,
      });
      if (creatorUserId) {
        await deliverReceiptsToCreatorInTx(tx, this.notifications, user, {
          source: 'FINANCE_TRANSFER',
          invoiceId: transfer.id,
          paymentId: transfer.id,
          invoiceNumber: transfer.transferNumber,
          invoiceStatus: updated.status,
          processedAt: updated.completedAt ?? new Date(),
          creatorUserId,
          notificationEntityType: 'FinanceTransfer',
          notificationEntityId: transfer.id,
          module: NotificationModule.FINANCE,
        });
      }

      if (amount >= LARGE_TRANSFER_THRESHOLD_KGS) {
        await this.notifications.notifyInTx(tx, user, {
          type: AlertType.FINANCE_TRANSFER_LARGE,
          entityType: 'FinanceTransfer',
          entityId: transfer.id,
          referenceNumber: transfer.transferNumber,
          message: `Large transfer ${transfer.transferNumber}: ${amount} ${transfer.currency}.`,
          recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER],
        });
      }

      return this.toTransferResponse(updated);
    });
  }

  cancelTransfer(user: AuthUser, id: string) {
    if (!canCancelFinanceTransfer(user)) {
      throw new ForbiddenException('Forbidden');
    }
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id);
      if (!EDITABLE_STATUSES.has(transfer.status) && transfer.status !== FinanceTransferStatus.PENDING_CASHIER) {
        throw new BadRequestException('Only draft, returned, or waiting transfers can be cancelled');
      }
      if (transfer.status === FinanceTransferStatus.COMPLETED) {
        throw new BadRequestException('Completed transfers cannot be cancelled; use reversal');
      }
      const updated = await tx.financeTransfer.update({
        where: { id },
        data: { status: FinanceTransferStatus.CANCELLED, version: { increment: 1 } },
        include: this.transferInclude(),
      });
      await this.audit(tx, user, 'finance.transfer.cancelled', id, { status: transfer.status }, {
        status: updated.status,
      });
      return this.toTransferResponse(updated);
    });
  }

  reverseTransfer(user: AuthUser, id: string, dto: ReverseFinanceTransferDto) {
    if (!canReverseFinanceTransfer(user)) {
      throw new ForbiddenException('Only CEO/Owner/Finance Manager can reverse completed transfers');
    }
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, id);
      if (transfer.status !== FinanceTransferStatus.COMPLETED) {
        throw new BadRequestException('Only completed transfers can be reversed');
      }
      const amount = Number(transfer.amount);

      // Reverse legs: destination OUT, source IN
      await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: transfer.destinationAccountId,
        branchId: null,
        entryType: FinanceLedgerEntryType.TRANSFER_OUT,
        amount,
        currency: transfer.currency,
        transferId: transfer.id,
        referenceType: 'FinanceTransferReversal',
        referenceId: transfer.id,
        notes: `Reversal of ${transfer.transferNumber}: ${dto.reason.trim()}`,
      });
      await this.ledgerService.postLedgerEntry(tx, user, {
        accountId: transfer.sourceAccountId,
        branchId: null,
        entryType: FinanceLedgerEntryType.TRANSFER_IN,
        amount,
        currency: transfer.currency,
        transferId: transfer.id,
        referenceType: 'FinanceTransferReversal',
        referenceId: transfer.id,
        notes: `Reversal of ${transfer.transferNumber}: ${dto.reason.trim()}`,
      });

      const reversal = await tx.financeTransfer.create({
        data: {
          transferNumber: buildFinanceDocumentNumber('FTR'),
          sourceAccountId: transfer.destinationAccountId,
          destinationAccountId: transfer.sourceAccountId,
          branchId: null,
          amount,
          currency: transfer.currency,
          transferDate: new Date(),
          status: FinanceTransferStatus.COMPLETED,
          requiresApproval: false,
          reason: `Reversal: ${dto.reason.trim()}`,
          notes: dto.reason.trim(),
          createdById: user.id,
          accountantId: user.id,
          cashierId: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          completedAt: new Date(),
          reversalOfTransferId: transfer.id,
        },
        include: this.transferInclude(),
      });

      await this.audit(tx, user, 'finance.transfer.reversed', transfer.id, {
        status: transfer.status,
        amount,
      }, {
        reversalTransferId: reversal.id,
        reason: dto.reason.trim(),
      });

      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_TRANSFER_REVERSED,
        entityType: 'FinanceTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        message: `Transfer ${transfer.transferNumber} was reversed.`,
        recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT],
      });

      return this.toTransferResponse(reversal);
    });
  }

  async uploadAttachment(
    user: AuthUser,
    transferId: string,
    request: FastifyRequest,
    entityType: FileAttachmentEntityType,
  ) {
    const transfer = await this.prisma.financeTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('Transfer not found');

    const roles = resolveUserRoles(user);
    const canUpload =
      hasAnyFullAccessRole(roles) ||
      (entityType === FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT
        ? canConfirmFinanceTransfer(user)
        : canPrepareFinanceTransfer(user));
    if (!canUpload) {
      throw new ForbiddenException('You do not have permission to upload transfer attachments');
    }

    if (
      entityType === FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT &&
      !AWAITING_CASHIER_STATUSES.has(transfer.status) &&
      transfer.status !== FinanceTransferStatus.COMPLETED
    ) {
      throw new BadRequestException('Receipt can only be uploaded for cashier-queue transfers');
    }

    if (
      entityType === FileAttachmentEntityType.FINANCE_TRANSFER_SUPPORT &&
      !EDITABLE_STATUSES.has(transfer.status)
    ) {
      throw new BadRequestException('Supporting documents can only be attached to draft or returned transfers');
    }

    let file: Awaited<ReturnType<FastifyRequest['file']>>;
    try {
      file = await request.file();
    } catch {
      throw new BadRequestException('File is too large');
    }
    if (!file) throw new BadRequestException('File is required');

    const allowedMimeTypes = new Map<string, string>([
      ['application/pdf', '.pdf'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
    ]);
    const extensionFromMime = allowedMimeTypes.get(file.mimetype);
    const originalExtension = extname(file.filename).toLowerCase();
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (!extensionFromMime || !allowedExtensions.includes(originalExtension)) {
      throw new BadRequestException('Invalid file format');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File is too large');
    }

    const uploadDirectory = join(process.cwd(), 'uploads', 'finance');
    await mkdir(uploadDirectory, { recursive: true });
    const extension = originalExtension === '.jpeg' ? '.jpg' : extensionFromMime;
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(join(uploadDirectory, storedName), buffer);
    const fileUrl = `/uploads/finance/${storedName}`;

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({
        data: {
          entityType,
          entityId: transfer.id,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          size: buffer.length,
          uploadedById: user.id,
        },
      });
      await this.audit(tx, user, 'finance.transfer.receipt_uploaded', transfer.id, null, {
        attachmentId: created.id,
        fileName: created.fileName,
        entityType,
      });
      if (entityType === FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT) {
        await auditReceiptEvent(tx, user, 'RECEIPT_UPLOADED', transfer.id, {
          invoiceId: transfer.id,
          paymentId: transfer.id,
          uploadedBy: user.id,
          creatorUserId: transfer.createdById,
          uploadedAt: created.createdAt.toISOString(),
          filename: created.fileName,
          attachmentId: created.id,
        });
      }
      return created;
    });

    return attachment;
  }

  /** @deprecated Prefer sendToCashier + confirmTransfer workflow */
  async approveTransfer(user: AuthUser, id: string) {
    if (canConfirmFinanceTransfer(user)) {
      return this.confirmTransfer(user, id, {});
    }
    throw new ForbiddenException('Use HQ Cashier confirm workflow for transfers');
  }

  private async validateAccounts(
    tx: Tx,
    user: AuthUser,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    requireBalance = true,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    if (sourceAccountId === destinationAccountId) {
      throw new BadRequestException('Source and destination cannot be the same account');
    }

    const [sourceAccount, destinationAccount] = await Promise.all([
      tx.financeAccount.findFirst({
        where: { id: sourceAccountId, deletedAt: null },
      }),
      tx.financeAccount.findFirst({
        where: { id: destinationAccountId, deletedAt: null },
      }),
    ]);
    if (!sourceAccount || !destinationAccount) {
      throw new NotFoundException('Source or destination account not found');
    }
    if (
      sourceAccount.status !== FinanceAccountStatus.ACTIVE ||
      destinationAccount.status !== FinanceAccountStatus.ACTIVE
    ) {
      throw new BadRequestException('Both accounts must be active');
    }
    if (
      sourceAccount.scope !== FinanceAccountScope.HQ ||
      destinationAccount.scope !== FinanceAccountScope.HQ
    ) {
      throw new BadRequestException('Only HQ Finance Accounts are allowed for this transfer workflow');
    }
    if (sourceAccount.currency !== destinationAccount.currency) {
      throw new BadRequestException('Currency mismatch between accounts');
    }

    const assignedAccountIds = await getActiveAssignmentAccountIds(this.prisma, user.id);
    assertCanAccessAccountScope(user, sourceAccount, assignedAccountIds);
    assertCanAccessAccountScope(user, destinationAccount, assignedAccountIds);

    if (requireBalance && amount > Number(sourceAccount.availableBalance) + 0.009) {
      throw new BadRequestException(
        `Insufficient balance on source account ${sourceAccount.name}`,
      );
    }

    return { sourceAccount, destinationAccount, amount: roundMoney(amount) };
  }

  private async lockTransfer(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "FinanceTransfer" WHERE id = ${id} FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Transfer not found');
    const transfer = await tx.financeTransfer.findUnique({
      where: { id },
      include: {
        sourceAccount: true,
        destinationAccount: true,
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  private async completeTransferEntries(
    tx: Tx,
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
  }

  private async afterSentToCashier(
    tx: Tx,
    user: AuthUser,
    transfer: { id: string; transferNumber: string; amount: unknown; currency: string },
  ) {
    await this.audit(tx, user, 'finance.transfer.submitted_to_cashier', transfer.id, null, {
      status: FinanceTransferStatus.PENDING_CASHIER,
      amount: Number(transfer.amount),
      transferNumber: transfer.transferNumber,
    });
    await this.notifications.notifyInTx(tx, user, {
      type: AlertType.FINANCE_TRANSFER_SENT_TO_CASHIER,
      entityType: 'FinanceTransfer',
      entityId: transfer.id,
      referenceNumber: transfer.transferNumber,
      message: `Transfer ${transfer.transferNumber} awaits HQ Cashier confirmation.`,
      recipientRoles: [Role.HQ_CASHIER, Role.FINANCE_MANAGER],
    });
    if (Number(transfer.amount) >= LARGE_TRANSFER_THRESHOLD_KGS) {
      await this.notifications.notifyInTx(tx, user, {
        type: AlertType.FINANCE_TRANSFER_LARGE,
        entityType: 'FinanceTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        message: `Large transfer ${transfer.transferNumber} submitted: ${Number(transfer.amount)} ${transfer.currency}.`,
        recipientRoles: [Role.CEO, Role.OWNER, Role.FINANCE_MANAGER],
      });
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
        entity: 'FinanceTransfer',
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

  private async toTransferResponse(transfer: any) {
    const attachments = await this.prisma.fileAttachment.findMany({
      where: { entityId: transfer.id, deletedAt: null },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...transfer,
      amount: Number(transfer.amount),
      sourceAccount: {
        ...transfer.sourceAccount,
        currentBalance: Number(transfer.sourceAccount.currentBalance),
        availableBalance: Number(transfer.sourceAccount.availableBalance),
      },
      destinationAccount: {
        ...transfer.destinationAccount,
        currentBalance: Number(transfer.destinationAccount.currentBalance),
        availableBalance: Number(transfer.destinationAccount.availableBalance),
      },
      attachments,
      receipts: attachments.filter(
        (item) => item.entityType === FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT,
      ),
      supportDocuments: attachments.filter(
        (item) => item.entityType === FileAttachmentEntityType.FINANCE_TRANSFER_SUPPORT,
      ),
    };
  }
}
