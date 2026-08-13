import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, CashierShiftStatus, FinanceLedgerEntryType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAccessAccountScope,
  canOperateCashierShift,
} from './finance-access.util';
import {
  CASHIER_ASSIGNMENT_OPERATIONS,
  assertCashierCapability,
} from '../rbac/cashier-capability.util';
import { assertCashierPaymentAllowed, getActiveAssignmentAccountIds } from './finance-assignment.util';
import { buildFinanceDocumentNumber, roundMoney } from './finance-number.util';
import { CloseCashierShiftDto, OpenCashierShiftDto } from './dto/cashier-shift.dto';

@Injectable()
export class FinanceShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private shiftInclude() {
    return {
      cashier: { select: { id: true, fullName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
      account: {
        select: {
          id: true,
          name: true,
          accountNumber: true,
          currentBalance: true,
          currency: true,
        },
      },
    };
  }

  private async getAssignedAccountIds(user: AuthUser) {
    return getActiveAssignmentAccountIds(this.prisma, user.id);
  }

  async listShifts(user: AuthUser, accountId?: string) {
    if (!user.branchId && !accountId) {
      return this.prisma.cashierShift.findMany({
        include: this.shiftInclude(),
        orderBy: { openedAt: 'desc' },
        take: 100,
      });
    }

    return this.prisma.cashierShift.findMany({
      where: {
        ...(user.branchId ? { branchId: user.branchId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(canOperateCashierShift(user) ? { cashierId: user.id } : {}),
      },
      include: this.shiftInclude(),
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  async openShift(user: AuthUser, dto: OpenCashierShiftDto) {
    assertCashierCapability(user);
    if (!user.branchId) {
      throw new ForbiddenException('Only branch employees can open shifts');
    }

    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, deletedAt: null, status: 'ACTIVE', branchId: user.branchId },
    });
    if (!account) throw new NotFoundException('Account not found');

    await assertCashierPaymentAllowed(this.prisma, user, {
      accountId: dto.accountId,
      operation: CASHIER_ASSIGNMENT_OPERATIONS.OPEN_SHIFT,
      branchId: user.branchId,
    });

    const existingOpen = await this.prisma.cashierShift.findFirst({
      where: {
        cashierId: user.id,
        accountId: dto.accountId,
        status: CashierShiftStatus.OPEN,
      },
    });
    if (existingOpen) {
      throw new BadRequestException('Shift is already open for this account');
    }

    const openingBalance = roundMoney(Number(dto.openingBalance));
    const shift = await this.prisma.cashierShift.create({
      data: {
        shiftNumber: buildFinanceDocumentNumber('CSH'),
        cashierId: user.id,
        branchId: user.branchId,
        accountId: dto.accountId,
        openingBalance,
        expectedBalance: openingBalance,
        comments: dto.comments,
      },
      include: this.shiftInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.shift.open',
        entity: 'CashierShift',
        entityId: shift.id,
        metadata: {
          accountId: account.id,
          branchId: user.branchId,
          employeeId: user.id,
          role: user.role,
          operation: 'SHIFT_OPEN',
          amount: openingBalance,
          beforeBalance: openingBalance,
          afterBalance: openingBalance,
          transactionNumber: shift.shiftNumber,
        },
      },
    });

    return shift;
  }

  async closeShift(user: AuthUser, id: string, dto: CloseCashierShiftDto) {
    assertCashierCapability(user);
    const shift = await this.prisma.cashierShift.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== CashierShiftStatus.OPEN) {
      throw new BadRequestException('Shift is already closed');
    }
    if (shift.cashierId !== user.id && !user.branchId) {
      throw new ForbiddenException('Forbidden');
    }
    if (user.branchId && shift.branchId !== user.branchId) {
      throw new ForbiddenException('Branch isolation violation');
    }

    await assertCashierPaymentAllowed(this.prisma, user, {
      accountId: shift.accountId,
      operation: CASHIER_ASSIGNMENT_OPERATIONS.CLOSE_SHIFT,
      branchId: shift.branchId,
    });

    const actualBalance = roundMoney(Number(dto.actualBalance));
    const accountBalance = roundMoney(Number(shift.account.currentBalance));

    const ledgerDelta = await this.prisma.financeLedgerEntry.aggregate({
      where: {
        accountId: shift.accountId,
        createdAt: { gte: shift.openedAt },
        entryType: {
          notIn: [FinanceLedgerEntryType.TRANSFER_IN, FinanceLedgerEntryType.TRANSFER_OUT],
        },
      },
      _sum: { signedAmount: true },
    });

    const transactionDelta = roundMoney(Number(ledgerDelta._sum.signedAmount ?? 0));
    const expectedBalance = roundMoney(Number(shift.openingBalance) + transactionDelta);
    const difference = roundMoney(actualBalance - expectedBalance);

    const closed = await this.prisma.cashierShift.update({
      where: { id },
      data: {
        status: CashierShiftStatus.CLOSED,
        expectedBalance,
        actualBalance,
        closingBalance: accountBalance,
        difference,
        comments: dto.comments ?? shift.comments,
        closedAt: new Date(),
      },
      include: this.shiftInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'finance.shift.close',
        entity: 'CashierShift',
        entityId: closed.id,
        metadata: {
          accountId: shift.accountId,
          branchId: shift.branchId,
          employeeId: user.id,
          role: user.role,
          operation: 'SHIFT_CLOSE',
          amount: actualBalance,
          beforeBalance: expectedBalance,
          afterBalance: actualBalance,
          difference,
          transactionNumber: closed.shiftNumber,
        },
      },
    });

    if (difference !== 0) {
      await this.notifications.notify(user, {
        type: AlertType.FINANCE_SHIFT_DIFFERENCE,
        branchId: shift.branchId,
        entityType: 'CashierShift',
        entityId: closed.id,
        referenceNumber: closed.shiftNumber,
      });
    }

    return closed;
  }
}
