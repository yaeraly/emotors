import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(query?: { action?: string; entity?: string; userId?: string; limit?: number }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query?.action) where.action = query.action;
    if (query?.entity) where.entity = query.entity;
    if (query?.userId) where.userId = query.userId;

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: query?.limit ?? 200,
    });
  }

  record(input: {
    userId?: string | null;
    role?: string | null;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({ data: input });
  }
}
