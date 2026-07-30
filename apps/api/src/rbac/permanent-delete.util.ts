import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { canPermanentDeleteBusinessData } from './rbac';

type AuditClient = Prisma.TransactionClient | PrismaService;

export function assertCanPermanentDeleteBusinessData(user: AuthUser) {
  if (!canPermanentDeleteBusinessData(user)) {
    throw new ForbiddenException('Only HQ SysAdmin can permanently delete business data');
  }
}

export async function auditPermanentDelete(
  client: AuditClient,
  user: AuthUser,
  entity: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  const deletedAt = new Date().toISOString();
  return client.auditLog.create({
    data: {
      userId: user.id,
      role: user.role,
      action: 'PERMANENT_DELETE',
      entity,
      entityId,
      metadata: {
        entityType: entity,
        entityId,
        deletedByUserId: user.id,
        deletedByRole: user.role,
        deletedAt,
        reason: metadata?.reason ?? null,
        recordSnapshot: metadata?.recordSnapshot ?? metadata?.summary ?? null,
        ...metadata,
      } as Prisma.InputJsonValue,
    },
  });
}
