import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { canPermanentDeleteBusinessData } from './rbac';

type AuditClient = Prisma.TransactionClient | PrismaService;

export function assertCanPermanentDeleteBusinessData(user: AuthUser) {
  if (!canPermanentDeleteBusinessData(user)) {
    throw new ForbiddenException('Only HQ Admin can permanently delete business data');
  }
}

export async function auditPermanentDelete(
  client: AuditClient,
  user: AuthUser,
  entity: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  return client.auditLog.create({
    data: {
      userId: user.id,
      role: user.role,
      action: 'DELETE',
      entity,
      entityId,
      metadata: {
        userId: user.id,
        role: user.role,
        entity,
        entityId,
        timestamp: new Date().toISOString(),
        ...metadata,
      } as Prisma.InputJsonValue,
    },
  });
}
