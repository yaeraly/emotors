import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileAttachmentEntityType,
  ProcurementPaymentInfoMethod,
  ProcurementSupplierPaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  canCreateProcurementOrder,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { UpsertPaymentInfoDto } from './dto/payment-info.dto';

type Tx = Prisma.TransactionClient;

const COMPLETED_PAYMENT_STATUSES: ProcurementSupplierPaymentStatus[] = [
  ProcurementSupplierPaymentStatus.ACTIVE,
];

@Injectable()
export class PaymentInfoService {
  constructor(private readonly prisma: PrismaService) {}

  async listVersions(user: AuthUser, orderId: string) {
    await this.assertCanView(user, orderId);
    const versions = await this.prisma.procurementPaymentInfoVersion.findMany({
      where: { procurementOrderId: orderId },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { versionNumber: 'desc' },
    });
    return Promise.all(versions.map((version) => this.toVersionResponse(version)));
  }

  async getActiveVersion(user: AuthUser, orderId: string) {
    await this.assertCanView(user, orderId);
    const version = await this.prisma.procurementPaymentInfoVersion.findFirst({
      where: { procurementOrderId: orderId, isActive: true },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });
    if (!version) return null;
    return this.toVersionResponse(version);
  }

  upsertPaymentInfo(user: AuthUser, orderId: string, dto: UpsertPaymentInfoDto) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only Supply Manager can edit payment information');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findFirst({
        where: { id: orderId, deletedAt: null },
      });
      if (!order) throw new NotFoundException('Procurement order not found');

      this.validatePaymentInfo(dto);

      const completedCount = await tx.procurementSupplierPayment.count({
        where: {
          procurementOrderId: orderId,
          status: { in: COMPLETED_PAYMENT_STATUSES },
        },
      });

      const active = await tx.procurementPaymentInfoVersion.findFirst({
        where: { procurementOrderId: orderId, isActive: true },
        include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      });

      if (!active) {
        const created = await tx.procurementPaymentInfoVersion.create({
          data: {
            procurementOrderId: orderId,
            versionNumber: 1,
            paymentMethod: dto.paymentMethod,
            bankName: dto.bankName?.trim() || null,
            accountHolder: dto.accountHolder?.trim() || null,
            accountNumber: dto.accountNumber?.trim() || null,
            swiftCode: dto.swiftCode?.trim() || null,
            bankAddress: dto.bankAddress?.trim() || null,
            comment: dto.comment?.trim() || null,
            isActive: true,
            createdById: user.id,
          },
          include: { createdBy: { select: { id: true, fullName: true, role: true } } },
        });
        await this.audit(tx, user, 'PAYMENT_INFO_CREATED', orderId, null, {
          versionId: created.id,
          versionNumber: created.versionNumber,
          paymentMethod: created.paymentMethod,
        });
        return this.toVersionResponse(created, tx);
      }

      if (completedCount > 0) {
        if (!dto.reason?.trim()) {
          throw new BadRequestException(
            'Reason is required to create a new payment information version after completed payments',
          );
        }
        await tx.procurementPaymentInfoVersion.updateMany({
          where: { procurementOrderId: orderId, isActive: true },
          data: { isActive: false },
        });
        const nextVersion = (active.versionNumber ?? 0) + 1;
        const created = await tx.procurementPaymentInfoVersion.create({
          data: {
            procurementOrderId: orderId,
            versionNumber: nextVersion,
            paymentMethod: dto.paymentMethod,
            bankName: dto.bankName?.trim() || null,
            accountHolder: dto.accountHolder?.trim() || null,
            accountNumber: dto.accountNumber?.trim() || null,
            swiftCode: dto.swiftCode?.trim() || null,
            bankAddress: dto.bankAddress?.trim() || null,
            comment: dto.comment?.trim() || null,
            reason: dto.reason.trim(),
            isActive: true,
            createdById: user.id,
          },
          include: { createdBy: { select: { id: true, fullName: true, role: true } } },
        });
        await this.audit(tx, user, 'PAYMENT_INFO_VERSION_CREATED', orderId, {
          previousVersionId: active.id,
          previousVersionNumber: active.versionNumber,
          paymentMethod: active.paymentMethod,
          bankName: active.bankName,
          accountNumber: active.accountNumber,
        }, {
          versionId: created.id,
          versionNumber: created.versionNumber,
          paymentMethod: created.paymentMethod,
          bankName: created.bankName,
          accountNumber: created.accountNumber,
          reason: created.reason,
        });
        if (active.paymentMethod !== created.paymentMethod) {
          await this.audit(tx, user, 'PAYMENT_INFO_BANK_ACCOUNT_CHANGED', orderId, {
            paymentMethod: active.paymentMethod,
          }, { paymentMethod: created.paymentMethod });
        }
        return this.toVersionResponse(created, tx);
      }

      const oldValue = {
        paymentMethod: active.paymentMethod,
        bankName: active.bankName,
        accountHolder: active.accountHolder,
        accountNumber: active.accountNumber,
        swiftCode: active.swiftCode,
        bankAddress: active.bankAddress,
        comment: active.comment,
      };
      const updated = await tx.procurementPaymentInfoVersion.update({
        where: { id: active.id },
        data: {
          paymentMethod: dto.paymentMethod,
          bankName: dto.bankName?.trim() || null,
          accountHolder: dto.accountHolder?.trim() || null,
          accountNumber: dto.accountNumber?.trim() || null,
          swiftCode: dto.swiftCode?.trim() || null,
          bankAddress: dto.bankAddress?.trim() || null,
          comment: dto.comment?.trim() || null,
        },
        include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      });
      await this.audit(tx, user, 'PAYMENT_INFO_UPDATED', orderId, oldValue, {
        paymentMethod: updated.paymentMethod,
        bankName: updated.bankName,
        accountHolder: updated.accountHolder,
        accountNumber: updated.accountNumber,
        swiftCode: updated.swiftCode,
        bankAddress: updated.bankAddress,
        comment: updated.comment,
      });
      if (oldValue.paymentMethod !== updated.paymentMethod || oldValue.accountNumber !== updated.accountNumber) {
        await this.audit(tx, user, 'PAYMENT_INFO_BANK_ACCOUNT_CHANGED', orderId, oldValue, {
          paymentMethod: updated.paymentMethod,
          accountNumber: updated.accountNumber,
          bankName: updated.bankName,
        });
      }
      return this.toVersionResponse(updated, tx);
    });
  }

  async uploadQr(
    user: AuthUser,
    orderId: string,
    request: FastifyRequest,
  ) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only Supply Manager can upload QR codes');
    }

    const active = await this.prisma.procurementPaymentInfoVersion.findFirst({
      where: { procurementOrderId: orderId, isActive: true },
    });
    if (!active) {
      throw new BadRequestException('Create payment information before uploading QR codes');
    }
    if (active.paymentMethod !== ProcurementPaymentInfoMethod.QR_CODE) {
      throw new BadRequestException('Payment method must be QR Code to upload QR images');
    }

    const completedCount = await this.prisma.procurementSupplierPayment.count({
      where: {
        procurementOrderId: orderId,
        status: { in: COMPLETED_PAYMENT_STATUSES },
      },
    });
    if (completedCount > 0) {
      throw new BadRequestException(
        'Cannot modify QR codes on a version used by completed payments. Create a new payment information version first.',
      );
    }

    let file: Awaited<ReturnType<FastifyRequest['file']>>;
    let description: string | null = null;
    try {
      const parts = request.parts();
      let uploaded: Awaited<ReturnType<FastifyRequest['file']>> | undefined;
      for await (const part of parts) {
        if (part.type === 'file' && (part.fieldname === 'file' || !uploaded)) {
          uploaded = part as Awaited<ReturnType<FastifyRequest['file']>>;
        } else if (part.type === 'field' && part.fieldname === 'description') {
          description = String(part.value || '').trim() || null;
        }
      }
      file = uploaded;
    } catch {
      throw new BadRequestException('File is too large');
    }
    if (!file) throw new BadRequestException('File is required');

    const allowedMimeTypes = new Map<string, string>([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
      ['application/pdf', '.pdf'],
    ]);
    const extensionFromMime = allowedMimeTypes.get(file.mimetype);
    const originalExtension = extname(file.filename).toLowerCase();
    if (!extensionFromMime || !['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(originalExtension)) {
      throw new BadRequestException('Invalid QR file format');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File is too large');
    }

    const uploadDirectory = join(process.cwd(), 'uploads', 'procurement');
    await mkdir(uploadDirectory, { recursive: true });
    const extension = originalExtension === '.jpeg' ? '.jpg' : extensionFromMime;
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(join(uploadDirectory, storedName), buffer);
    const fileUrl = `/uploads/procurement/${storedName}`;

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({
        data: {
          entityType: FileAttachmentEntityType.PAYMENT_QR,
          entityId: active.id,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          size: buffer.length,
          description,
          uploadedById: user.id,
        },
      });
      await this.audit(tx, user, 'PAYMENT_INFO_QR_ADDED', orderId, null, {
        versionId: active.id,
        attachmentId: created.id,
        fileName: created.fileName,
        description,
      });
      return created;
    });

    return attachment;
  }

  async removeQr(user: AuthUser, orderId: string, attachmentId: string) {
    if (!canCreateProcurementOrder(user) && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('Only Supply Manager can remove QR codes');
    }

    return this.prisma.$transaction(async (tx) => {
      const active = await tx.procurementPaymentInfoVersion.findFirst({
        where: { procurementOrderId: orderId, isActive: true },
      });
      if (!active) throw new NotFoundException('Payment information not found');

      const completedCount = await tx.procurementSupplierPayment.count({
        where: {
          procurementOrderId: orderId,
          status: { in: COMPLETED_PAYMENT_STATUSES },
        },
      });
      if (completedCount > 0) {
        throw new BadRequestException(
          'Cannot remove QR codes after completed payments. Create a new payment information version first.',
        );
      }

      const attachment = await tx.fileAttachment.findFirst({
        where: {
          id: attachmentId,
          entityType: FileAttachmentEntityType.PAYMENT_QR,
          entityId: active.id,
          deletedAt: null,
        },
      });
      if (!attachment) throw new NotFoundException('QR attachment not found');

      await tx.fileAttachment.update({
        where: { id: attachment.id },
        data: { deletedAt: new Date(), isCurrent: false },
      });
      await this.audit(tx, user, 'PAYMENT_INFO_QR_REMOVED', orderId, {
        attachmentId: attachment.id,
        fileName: attachment.fileName,
      }, null);
      return { id: attachment.id, deleted: true };
    });
  }

  /** Used when creating an order with initial payment info payload */
  async createInitialVersionInTx(
    tx: Tx,
    user: AuthUser,
    orderId: string,
    dto: UpsertPaymentInfoDto,
  ) {
    this.validatePaymentInfo(dto);
    const created = await tx.procurementPaymentInfoVersion.create({
      data: {
        procurementOrderId: orderId,
        versionNumber: 1,
        paymentMethod: dto.paymentMethod ?? ProcurementPaymentInfoMethod.BANK_ACCOUNT,
        bankName: dto.bankName?.trim() || null,
        accountHolder: dto.accountHolder?.trim() || null,
        accountNumber: dto.accountNumber?.trim() || null,
        swiftCode: dto.swiftCode?.trim() || null,
        bankAddress: dto.bankAddress?.trim() || null,
        comment: dto.comment?.trim() || null,
        isActive: true,
        createdById: user.id,
      },
    });
    await this.audit(tx, user, 'PAYMENT_INFO_CREATED', orderId, null, {
      versionId: created.id,
      versionNumber: 1,
      paymentMethod: created.paymentMethod,
    });
    return created;
  }

  private validatePaymentInfo(dto: UpsertPaymentInfoDto) {
    if (dto.paymentMethod === ProcurementPaymentInfoMethod.BANK_ACCOUNT) {
      if (!dto.bankName?.trim() || !dto.accountHolder?.trim() || !dto.accountNumber?.trim()) {
        throw new BadRequestException(
          'Bank name, account holder, and account number are required for Supplier Bank Account',
        );
      }
    }
  }

  private async assertCanView(user: AuthUser, orderId: string) {
    const order = await this.prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Procurement order not found');
    const roles = resolveUserRoles(user);
    if (
      canCreateProcurementOrder(user) ||
      hasAnyFullAccessRole(roles) ||
      roles.includes(Role.HQ_ACCOUNTANT) ||
      roles.includes(Role.FINANCE_MANAGER) ||
      roles.includes(Role.HQ_CASHIER)
    ) {
      return;
    }
    throw new ForbiddenException('Forbidden');
  }

  private async toVersionResponse(version: any, tx?: Tx) {
    const db = tx ?? this.prisma;
    const qrCodes = await db.fileAttachment.findMany({
      where: {
        entityType: FileAttachmentEntityType.PAYMENT_QR,
        entityId: version.id,
        deletedAt: null,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...version,
      qrCodes,
    };
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
        entity: 'ProcurementPaymentInfoVersion',
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
}
