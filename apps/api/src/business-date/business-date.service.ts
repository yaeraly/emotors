import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { canUpdateBusinessDate } from '../rbac/rbac';
import {
  assertBusinessDateWithinAllowedRange,
  getAllowedBusinessDateRange,
  parseBusinessDateInput,
} from './business-date-range.util';
import {
  BUSINESS_DATE_ENTITY_REGISTRY,
  isSupportedBusinessDateEntity,
  resolveBusinessDateEntityConfig,
  type BusinessDateEntityType,
} from './business-date.registry';
import {
  assertFifoBatchDateChangeValid,
  assertProcurementReceivingDateChangeValid,
} from './business-date-chronology.util';
import { UpdateBusinessDateDto } from './dto/update-business-date.dto';

type PrismaDelegate = {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
};

@Injectable()
export class BusinessDateService {
  constructor(private readonly prisma: PrismaService) {}

  getAllowedRange() {
    return getAllowedBusinessDateRange();
  }

  listSupportedEntities() {
    return Object.entries(BUSINESS_DATE_ENTITY_REGISTRY).map(([entityType, config]) => ({
      entityType,
      fields: config.fields,
    }));
  }

  async updateBusinessDate(user: AuthUser, dto: UpdateBusinessDateDto) {
    if (!canUpdateBusinessDate(user)) {
      throw new ForbiddenException('Only HQ Admin can update business dates');
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException({ message: 'Reason is required', code: 'REASON_REQUIRED' });
    }

    if (!isSupportedBusinessDateEntity(dto.entityType, dto.fieldName)) {
      throw new BadRequestException({
        message: 'Unsupported entity or field',
        code: 'UNSUPPORTED_ENTITY',
      });
    }

    const newDate = parseBusinessDateInput(dto.newDate);
    assertBusinessDateWithinAllowedRange(newDate);

    const config = resolveBusinessDateEntityConfig(dto.entityType, dto.fieldName);
    const delegate = (this.prisma as unknown as Record<string, PrismaDelegate>)[config.prismaModel];
    if (!delegate) {
      throw new BadRequestException({ message: 'Unsupported entity', code: 'UNSUPPORTED_ENTITY' });
    }

    const record = await delegate.findFirst({
      where: { id: dto.entityId, ...(this.softDeleteFilter(dto.entityType)) },
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const oldValue = record[config.fieldName];
    const oldDate =
      oldValue instanceof Date ? oldValue : oldValue ? new Date(String(oldValue)) : null;

    if (oldDate && oldDate.getTime() === newDate.getTime()) {
      return { ...record, unchanged: true };
    }

    await this.validateChronology(dto.entityType as BusinessDateEntityType, dto.entityId, newDate);

    const branchId = config.branchIdField
      ? (record[config.branchIdField] as string | null | undefined)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[config.prismaModel];
      const result = await txDelegate.update({
        where: { id: dto.entityId },
        data: { [config.fieldName]: newDate },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BUSINESS_DATE_CHANGED',
          entity: dto.entityType,
          entityId: dto.entityId,
          metadata: {
            entityType: dto.entityType,
            entityId: dto.entityId,
            fieldName: config.fieldName,
            oldDate: oldDate?.toISOString() ?? null,
            newDate: newDate.toISOString(),
            reason: dto.reason.trim(),
            changedByUserId: user.id,
            changedByRole: user.role,
            changedAt: new Date().toISOString(),
            branchId,
          } as Prisma.InputJsonValue,
        },
      });

      return result;
    });

    return updated;
  }

  private softDeleteFilter(entityType: string): Record<string, null> | Record<string, never> {
    const withSoftDelete = [
      'Sale',
      'ProcurementOrder',
      'GoodsReceiving',
      'BranchInvoice',
      'BranchPayment',
      'FinanceInvestment',
      'ProcurementGoodsReceiving',
    ];
    return withSoftDelete.includes(entityType) ? { deletedAt: null } : {};
  }

  private async validateChronology(
    entityType: BusinessDateEntityType,
    entityId: string,
    newDate: Date,
  ) {
    if (entityType === 'FifoInventoryBatch' && entityId) {
      await assertFifoBatchDateChangeValid(this.prisma, entityId, newDate);
    }
    if (entityType === 'ProcurementGoodsReceiving') {
      await assertProcurementReceivingDateChangeValid(this.prisma, entityId, newDate);
    }
  }
}
