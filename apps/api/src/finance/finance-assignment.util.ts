import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceAccountScope, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CASHIER_ASSIGNMENT_OPERATIONS,
  CashierAssignmentOperation,
  assertAssignmentOperationAllowed,
  assertCashierCapability,
  hasCashierCapability,
  isAssignmentCurrentlyActive,
} from '../rbac/cashier-capability.util';
import {
  hasAnyFullAccessRole,
  isBranchAccountantUser,
  isBranchOwnerUser,
  resolveUserRoles,
} from '../rbac/rbac';
import { canManageFinanceAccounts } from './finance-access.util';

export async function getActiveAssignmentAccountIds(prisma: PrismaService, userId: string) {
  const now = new Date();
  const assignments = await prisma.financeAccountAssignment.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
    },
    select: { accountId: true },
  });
  return new Set(assignments.map((row) => row.accountId));
}

export async function getActiveAssignment(
  prisma: PrismaService,
  userId: string,
  accountId: string,
) {
  const assignments = await prisma.financeAccountAssignment.findMany({
    where: { userId, accountId, isActive: true },
  });
  return assignments.find((assignment) => isAssignmentCurrentlyActive(assignment)) ?? null;
}

export async function assertCashierPaymentAllowed(
  prisma: PrismaService,
  user: AuthUser,
  options: {
    accountId?: string;
    operation?: CashierAssignmentOperation;
    branchId?: string | null;
  },
) {
  assertCashierCapability(user);

  if (options.branchId && user.branchId && user.branchId !== options.branchId) {
    throw new ForbiddenException('Branch isolation violation');
  }

  const assignments = await prisma.financeAccountAssignment.findMany({
    where: {
      userId: user.id,
      isActive: true,
      ...(options.accountId ? { accountId: options.accountId } : {}),
    },
    include: {
      account: { select: { id: true, branchId: true, scope: true, typeCode: true, status: true } },
    },
  });

  const activeAssignments = assignments.filter((assignment) => isAssignmentCurrentlyActive(assignment));
  if (!activeAssignments.length) {
    throw new BadRequestException('An active account assignment is required to accept payments');
  }

  if (options.accountId) {
    const assignment = activeAssignments.find((row) => row.accountId === options.accountId);
    if (!assignment) {
      throw new BadRequestException('You are not assigned to the selected account');
    }
    if (assignment.account.scope === FinanceAccountScope.HQ) {
      throw new ForbiddenException('Branch cashiers cannot use HQ accounts');
    }
    if (options.operation) {
      assertAssignmentOperationAllowed(assignment.allowedOperations, options.operation);
    }
    return assignment;
  }

  const eligible = activeAssignments.find((assignment) =>
    assignment.allowedOperations.includes(
      options.operation ?? CASHIER_ASSIGNMENT_OPERATIONS.RECEIVE_PAYMENTS,
    ),
  );
  if (!eligible) {
    throw new BadRequestException('No assigned account allows this payment operation');
  }

  return eligible;
}

export function canViewAllBranchAccounts(user: AuthUser) {
  return (
    canManageFinanceAccounts(user) ||
    isBranchOwnerUser(user) ||
    isBranchAccountantUser(user)
  );
}

export function shouldRestrictToAssignedAccounts(user: AuthUser) {
  const roles = resolveUserRoles(user);
  if (roles.includes(Role.HQ_CASHIER) && !canManageFinanceAccounts(user)) {
    return true;
  }
  return hasCashierCapability(user) && !canViewAllBranchAccounts(user);
}

export async function assertHqCashierAssignedAccount(
  prisma: PrismaService,
  user: AuthUser,
  accountId: string,
) {
  const roles = resolveUserRoles(user);
  if (
    !roles.includes(Role.HQ_CASHIER) ||
    hasAnyFullAccessRole(roles) ||
    canManageFinanceAccounts(user)
  ) {
    return;
  }
  const assignedAccountIds = await getActiveAssignmentAccountIds(prisma, user.id);
  if (!assignedAccountIds.has(accountId)) {
    throw new ForbiddenException('Cashier can only access assigned accounts');
  }
}

export async function listCashierEligibleEmployees(
  prisma: PrismaService,
  branchId: string | null,
) {
  if (branchId === null) {
    const rows = await prisma.user.findMany({
      where: {
        branchId: null,
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { role: Role.HQ_CASHIER },
          {
            userRoles: {
              some: {
                role: { code: Role.HQ_CASHIER },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        userRoles: { include: { role: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      roles: row.userRoles.map((userRole) => userRole.role.code),
    }));
  }

  const permission = await prisma.permission.findUnique({ where: { code: 'cashier' } });
  if (!permission) return [];

  const rows = await prisma.user.findMany({
    where: {
      branchId,
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { role: Role.CASHIER },
        {
          userRoles: {
            some: {
              role: { code: Role.CASHIER },
            },
          },
        },
        {
          userPermissionsHeld: {
            some: {
              permissionId: permission.id,
              isActive: true,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      userRoles: { include: { role: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    roles: row.userRoles.map((userRole) => userRole.role.code),
  }));
}
