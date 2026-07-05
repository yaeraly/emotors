import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlertStatus,
  AlertType,
  NotificationModule,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole } from '../rbac/rbac';
import {
  DEFAULT_NOTIFICATION_COPY,
  moduleForAlertType,
  NOTIFICATION_ROUTING,
  rolesForAlertType,
} from './notification-routing';
import { NotificationQueryDto } from './dto/notification-query.dto';

type PrismaTx = Prisma.TransactionClient;

export type NotifyInput = {
  type: AlertType;
  branchId?: string | null;
  entityType?: string;
  entityId?: string;
  referenceNumber?: string;
  title?: string;
  message?: string;
  module?: NotificationModule;
  recipientRoles?: Role[];
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(user: AuthUser, query: NotificationQueryDto = {}) {
    return this.prisma.alert.findMany({
      where: this.buildWhereForUser(user, query),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(user: AuthUser) {
    return this.prisma.alert.count({
      where: {
        ...this.buildWhereForUser(user, {}),
        status: AlertStatus.UNREAD,
      },
    });
  }

  async markRead(user: AuthUser, id: string) {
    const alert = await this.findAccessibleAlert(user, id);
    if (alert.status === AlertStatus.UNREAD) {
      const updated = await this.prisma.alert.update({
        where: { id },
        data: { status: AlertStatus.READ, readAt: new Date() },
      });
      await this.audit(user, 'NOTIFICATION_READ', id, { alertType: alert.type });
      return updated;
    }
    return alert;
  }

  async archive(user: AuthUser, id: string) {
    if (!hasAnyFullAccessRole(user.roles?.length ? user.roles : [user.role])) {
      throw new ForbiddenException('Only CEO can archive notifications');
    }
    const alert = await this.findAccessibleAlert(user, id);
    const updated = await this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.ARCHIVED, archivedAt: new Date() },
    });
    await this.audit(user, 'NOTIFICATION_ARCHIVED', id, { alertType: alert.type });
    return updated;
  }

  notify(user: AuthUser | null, input: NotifyInput) {
    return this.notifyInTx(this.prisma, user, input);
  }

  async notifyInTx(tx: PrismaTx, user: AuthUser | null, input: NotifyInput) {
    const copy = DEFAULT_NOTIFICATION_COPY[input.type];
    const module = input.module ?? moduleForAlertType(input.type);
    const roles = input.recipientRoles?.length
      ? input.recipientRoles
      : rolesForAlertType(input.type);
    const title = input.title ?? copy?.title ?? input.type;
    const message = input.message ?? copy?.message ?? '';
    const targetRoles: Array<Role | null> = roles.length ? roles : [null];

    const created = [];
    for (const recipientRole of targetRoles) {
      const alert = await tx.alert.create({
        data: {
          branchId: input.branchId ?? null,
          type: input.type,
          module,
          recipientRole: recipientRole ?? undefined,
          referenceNumber: input.referenceNumber,
          title,
          message,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      });
      created.push(alert);
      if (user) {
        await this.auditInTx(tx, user, 'NOTIFICATION_CREATED', alert.id, {
          alertType: input.type,
          module,
          recipientRole,
          referenceNumber: input.referenceNumber,
          entityType: input.entityType,
          entityId: input.entityId,
        });
      }
    }
    return created;
  }

  private async findAccessibleAlert(user: AuthUser, id: string) {
    const alert = await this.prisma.alert.findFirst({
      where: { id, ...this.buildWhereForUser(user, {}) },
    });
    if (!alert) throw new NotFoundException('Notification not found');
    return alert;
  }

  private buildWhereForUser(
    user: AuthUser,
    query: NotificationQueryDto,
  ): Prisma.AlertWhereInput {
    const roles = user.roles?.length ? user.roles : [user.role];
    const isExecutive = hasAnyFullAccessRole(roles);
    const includeArchived = query.includeArchived === 'true';

    const filters: Prisma.AlertWhereInput = {
      ...(query.status ? { status: query.status } : includeArchived ? {} : { status: { not: AlertStatus.ARCHIVED } }),
      ...(query.module ? { module: query.module } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { message: { contains: query.search.trim(), mode: 'insensitive' } },
              { referenceNumber: { contains: query.search.trim(), mode: 'insensitive' } },
              { module: { equals: query.search.trim() as NotificationModule } },
            ],
          }
        : {}),
    };

    if (isExecutive) {
      return filters;
    }

    if (user.branchId) {
      return {
        AND: [
          filters,
          { branchId: user.branchId },
          {
            OR: [
              { recipientRole: { in: roles as Role[] } },
              { recipientRole: null },
            ],
          },
        ],
      };
    }

    const allowedModules = this.allowedModulesForRoles(roles);
    return {
      AND: [
        filters,
        {
          OR: [
            { recipientRole: { in: roles as Role[] } },
            {
              recipientRole: null,
              branchId: null,
              ...(allowedModules.length ? { module: { in: allowedModules } } : {}),
            },
          ],
        },
      ],
    };
  }

  private allowedModulesForRoles(roles: Role[]): NotificationModule[] {
    const modules = new Set<NotificationModule>();
    for (const role of roles) {
      for (const routing of Object.values(NOTIFICATION_ROUTING)) {
        if (routing && routing.roles.includes(role)) {
          modules.add(routing.module);
        }
      }
    }
    if (roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
      [
        NotificationModule.PROCUREMENT,
        NotificationModule.WAREHOUSE,
        NotificationModule.BRANCH_ORDERS,
        NotificationModule.DISTRIBUTION,
      ].forEach((module) => modules.add(module));
    }
    if (roles.includes(Role.WAREHOUSE_MANAGER)) {
      [
        NotificationModule.WAREHOUSE,
        NotificationModule.INVENTORY,
        NotificationModule.DISTRIBUTION,
        NotificationModule.PROCUREMENT,
      ].forEach((module) => modules.add(module));
    }
    if (roles.includes(Role.FINANCE_MANAGER) || roles.includes(Role.ACCOUNTANT)) {
      [NotificationModule.FINANCE, NotificationModule.SUPPLIER_PAYMENT].forEach((module) => modules.add(module));
    }
    return Array.from(modules);
  }

  private audit(user: AuthUser, action: string, entityId: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Alert',
        entityId,
        metadata: { roles: user.roles ?? [user.role], ...metadata },
      },
    });
  }

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Alert',
        entityId,
        metadata: { roles: user.roles ?? [user.role], ...metadata },
      },
    });
  }
}
