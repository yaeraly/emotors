import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  BranchInstallmentEarlyPaymentStatus,
  BranchInstallmentEarlyPaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
  FinanceAccountScope,
  FinanceAccountStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canRequestBranchOrderInstallment,
  canSendInvoiceToCashier,
  isBranchOwnerUser,
  resolveUserRoles,
} from '../rbac/rbac';
import {
  ACTIVE_EARLY_PAYMENT_STATUSES,
  canSendEarlyPaymentToCashier,
  isEarlyPaymentSentToCashier,
  resolveEarlyPaymentApprovedAmount,
  validateEarlyPaymentAmount,
} from './branch-installment-early-payment.util';
import { buildBranchOrderInstallmentSchedule } from './branch-order-installment.util';
import { CreateInstallmentEarlyPaymentDto } from './dto/create-installment-early-payment.dto';
import { RejectInstallmentEarlyPaymentDto } from './dto/reject-installment-early-payment.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class BranchInstallmentEarlyPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private requestInclude() {
    return {
      installment: true,
      invoice: {
        include: {
          distributionOrder: { select: { orderNumber: true } },
        },
      },
      financeAccount: {
        select: {
          id: true,
          name: true,
          accountNumber: true,
          currentBalance: true,
          availableBalance: true,
        },
      },
      requestedBy: { select: { id: true, fullName: true } },
      branchCeoApprovedBy: { select: { id: true, fullName: true } },
      branchCeoRejectedBy: { select: { id: true, fullName: true } },
      sentToCashierBy: { select: { id: true, fullName: true } },
    };
  }

  serializeRequest(request: any) {
    const approvedAmount = request.approvedAmount != null ? Number(request.approvedAmount) : null;
    const remainingDebtAtRequest = Number(request.remainingDebtAtRequest);
    const financeAccount = request.financeAccount
      ? {
          id: request.financeAccount.id,
          name: request.financeAccount.name,
          accountNumber: request.financeAccount.accountNumber,
          currentBalance: Number(request.financeAccount.currentBalance),
          availableBalance: Number(request.financeAccount.availableBalance),
        }
      : null;
    const expectedBalanceAfter =
      financeAccount && approvedAmount != null
        ? this.roundMoney(financeAccount.availableBalance - approvedAmount)
        : null;

    return {
      id: request.id,
      branchId: request.branchId,
      invoiceId: request.invoiceId,
      installmentId: request.installmentId,
      orderNumber: request.invoice?.distributionOrder?.orderNumber ?? null,
      paymentType: request.paymentType,
      status: request.status,
      requestedAmount: Number(request.requestedAmount),
      approvedAmount,
      remainingDebtAtRequest,
      remainingDebt: Number(request.invoice?.debtAmount ?? remainingDebtAtRequest),
      financeAccountId: request.financeAccountId,
      financeAccount,
      expectedCashboxBalanceAfterPayment: expectedBalanceAfter,
      requestComment: request.requestComment,
      rejectionComment: request.rejectionComment,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      branchCeoApprovedBy: request.branchCeoApprovedBy,
      branchCeoApprovedAt: request.branchCeoApprovedAt,
      branchCeoRejectedBy: request.branchCeoRejectedBy,
      branchCeoRejectedAt: request.branchCeoRejectedAt,
      sentToCashierBy: request.sentToCashierBy,
      sentToCashierAt: request.sentToCashierAt,
      canSendToCashier: canSendEarlyPaymentToCashier(request.status),
      sentToCashier: isEarlyPaymentSentToCashier(request.status),
    };
  }

  async listForInvoice(user: AuthUser, invoiceId: string) {
    if (!canRequestBranchOrderInstallment(user)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    const requests = await this.prisma.branchInstallmentEarlyPaymentRequest.findMany({
      where: { invoiceId, branchId: user.branchId! },
      include: this.requestInclude(),
      orderBy: { requestedAt: 'desc' },
    });
    return requests.map((r) => this.serializeRequest(r));
  }

  async createRequest(user: AuthUser, invoiceId: string, dto: CreateInstallmentEarlyPaymentDto) {
    if (!canRequestBranchOrderInstallment(user)) {
      throw new ForbiddenException('Недостаточно прав для запроса досрочного погашения');
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.branchInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null, branchId: user.branchId! },
        include: { branchOrderInstallment: true },
      });
      if (!invoice) throw new NotFoundException('Счёт не найден');
      const installment = invoice.branchOrderInstallment;
      if (!installment || installment.status !== BranchOrderInstallmentStatus.APPROVED) {
        throw new BadRequestException('Активная рассрочка не найдена');
      }
      if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Счёт уже закрыт');
      }

      const remainingDebt = this.roundMoney(Number(invoice.debtAmount));
      if (remainingDebt <= 0) {
        throw new BadRequestException('Задолженность уже погашена');
      }

      const existingActive = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
        where: {
          invoiceId,
          status: { in: ACTIVE_EARLY_PAYMENT_STATUSES },
        },
      });
      if (existingActive) {
        throw new BadRequestException('Уже есть активный запрос досрочного погашения');
      }

      const requestedAmount = this.roundMoney(Number(dto.requestedAmount));
      const validationError = validateEarlyPaymentAmount(dto.paymentType, requestedAmount, remainingDebt);
      if (validationError === 'AMOUNT_REQUIRED') {
        throw new BadRequestException('Сумма досрочного погашения должна быть больше нуля');
      }
      if (validationError === 'AMOUNT_EXCEEDS_DEBT') {
        throw new BadRequestException('Сумма не может превышать остаток задолженности');
      }
      if (validationError === 'FULL_PAYMENT_AMOUNT_MISMATCH') {
        throw new BadRequestException('Для полного досрочного погашения сумма должна равняться остатку долга');
      }

      let financeAccountId: string | null = dto.financeAccountId?.trim() || null;
      if (financeAccountId) {
        const account = await tx.financeAccount.findFirst({
          where: {
            id: financeAccountId,
            deletedAt: null,
            status: FinanceAccountStatus.ACTIVE,
            scope: FinanceAccountScope.BRANCH,
            branchId: invoice.branchId,
          },
        });
        if (!account) {
          throw new BadRequestException('Счёт филиала не найден');
        }
      }

      const request = await tx.branchInstallmentEarlyPaymentRequest.create({
        data: {
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          installmentId: installment.id,
          paymentType: dto.paymentType,
          requestedAmount,
          remainingDebtAtRequest: remainingDebt,
          financeAccountId,
          requestComment: dto.comment?.trim() || null,
          requestedById: user.id,
        },
        include: this.requestInclude(),
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'EARLY_PAYMENT_REQUEST_CREATED',
          entity: 'BranchInstallmentEarlyPaymentRequest',
          entityId: request.id,
          metadata: {
            invoiceId,
            installmentId: installment.id,
            branchId: invoice.branchId,
            paymentType: dto.paymentType,
            requestedAmount,
            remainingDebt,
            financeAccountId,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.BRANCH_EARLY_PAYMENT_REQUESTED,
        title: 'Запрос досрочного погашения рассрочки',
        message: `Бухгалтер запросил досрочное погашение по счёту ${invoice.invoiceNumber}`,
        entityType: 'BranchInstallmentEarlyPaymentRequest',
        entityId: request.id,
        recipientRoles: [Role.FRANCHISE_OWNER],
      });

      return this.serializeRequest(request);
    });
  }

  async listPendingForBranchCeo(user: AuthUser) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Доступ только для Branch CEO');
    }
    const requests = await this.prisma.branchInstallmentEarlyPaymentRequest.findMany({
      where: {
        branchId: user.branchId!,
        status: BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL,
      },
      include: this.requestInclude(),
      orderBy: { requestedAt: 'asc' },
    });
    return requests.map((r) => this.serializeRequest(r));
  }

  async approve(user: AuthUser, requestId: string) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Доступ только для Branch CEO');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
        where: { id: requestId, branchId: user.branchId! },
        include: { invoice: true, installment: true },
      });
      if (!request) throw new NotFoundException('Запрос не найден');
      if (request.status !== BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL) {
        throw new BadRequestException('Запрос уже рассмотрен');
      }

      const remainingDebt = this.roundMoney(Number(request.invoice.debtAmount));
      const approvedAmount = resolveEarlyPaymentApprovedAmount(
        request.paymentType,
        Number(request.requestedAmount),
        remainingDebt,
      );

      const updated = await tx.branchInstallmentEarlyPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
          approvedAmount,
          branchCeoApprovedById: user.id,
          branchCeoApprovedAt: new Date(),
        },
        include: this.requestInclude(),
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'EARLY_PAYMENT_APPROVED_BY_BRANCH_CEO',
          entity: 'BranchInstallmentEarlyPaymentRequest',
          entityId: request.id,
          metadata: {
            invoiceId: request.invoiceId,
            installmentId: request.installmentId,
            branchId: request.branchId,
            approvedAmount,
            remainingDebt,
            previousStatus: request.status,
            newStatus: BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createAlert(tx, user, {
        branchId: request.branchId,
        type: AlertType.BRANCH_EARLY_PAYMENT_APPROVED,
        title: 'Досрочное погашение утверждено Branch CEO',
        message: `Branch CEO утвердил досрочное погашение по счёту ${request.invoice.invoiceNumber}`,
        entityType: 'BranchInstallmentEarlyPaymentRequest',
        entityId: request.id,
        recipientRoles: [Role.ACCOUNTANT],
      });

      return this.serializeRequest(updated);
    });
  }

  async reject(user: AuthUser, requestId: string, dto: RejectInstallmentEarlyPaymentDto) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Доступ только для Branch CEO');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
        where: { id: requestId, branchId: user.branchId! },
        include: { invoice: true },
      });
      if (!request) throw new NotFoundException('Запрос не найден');
      if (request.status !== BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL) {
        throw new BadRequestException('Запрос уже рассмотрен');
      }

      const updated = await tx.branchInstallmentEarlyPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: BranchInstallmentEarlyPaymentStatus.REJECTED_BY_BRANCH_CEO,
          rejectionComment: dto.reason.trim(),
          branchCeoRejectedById: user.id,
          branchCeoRejectedAt: new Date(),
        },
        include: this.requestInclude(),
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'EARLY_PAYMENT_REJECTED_BY_BRANCH_CEO',
          entity: 'BranchInstallmentEarlyPaymentRequest',
          entityId: request.id,
          metadata: {
            invoiceId: request.invoiceId,
            branchId: request.branchId,
            reason: dto.reason.trim(),
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createAlert(tx, user, {
        branchId: request.branchId,
        type: AlertType.BRANCH_EARLY_PAYMENT_REJECTED,
        title: 'Досрочное погашение отклонено',
        message: `Branch CEO отклонил досрочное погашение: ${dto.reason.trim()}`,
        entityType: 'BranchInstallmentEarlyPaymentRequest',
        entityId: request.id,
        recipientRoles: [Role.ACCOUNTANT],
      });

      return this.serializeRequest(updated);
    });
  }

  async sendToCashier(user: AuthUser, invoiceId: string, requestId: string) {
    if (!canSendInvoiceToCashier(user)) {
      throw new ForbiddenException('Только бухгалтер филиала может передать счёт кассиру');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.branchInstallmentEarlyPaymentRequest.findFirst({
        where: { id: requestId, invoiceId, branchId: user.branchId! },
        include: { invoice: { include: { branchOrderInstallment: true } } },
      });
      if (!request) throw new NotFoundException('Запрос досрочного погашения не найден');

      if (isEarlyPaymentSentToCashier(request.status)) {
        const existing = await tx.branchInstallmentEarlyPaymentRequest.findUniqueOrThrow({
          where: { id: request.id },
          include: this.requestInclude(),
        });
        return this.serializeRequest(existing);
      }

      if (!canSendEarlyPaymentToCashier(request.status)) {
        throw new BadRequestException('Запрос должен быть утверждён Branch CEO перед отправкой в кассу');
      }

      const invoice = request.invoice;
      if (!invoice.sentToBranchAt) {
        throw new BadRequestException('Счёт ещё не доступен бухгалтеру филиала');
      }
      if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === BranchInvoiceStatus.CANCELLED) {
        throw new BadRequestException('Счёт уже закрыт');
      }

      const approvedAmount = this.roundMoney(Number(request.approvedAmount ?? request.requestedAmount));
      const remainingDebt = this.roundMoney(Number(invoice.debtAmount));
      if (approvedAmount <= 0 || approvedAmount > remainingDebt) {
        throw new BadRequestException('Утверждённая сумма недействительна');
      }

      const now = new Date();
      await tx.branchInstallmentEarlyPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
          sentToCashierById: user.id,
          sentToCashierAt: now,
        },
      });

      await tx.branchInvoice.update({
        where: { id: invoice.id },
        data: { sentToCashierAt: now },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'EARLY_PAYMENT_SENT_TO_BRANCH_CASHIER',
          entity: 'BranchInstallmentEarlyPaymentRequest',
          entityId: request.id,
          metadata: {
            invoiceId,
            installmentId: request.installmentId,
            branchId: request.branchId,
            approvedAmount,
            remainingDebt,
            sentById: user.id,
            sentAt: now.toISOString(),
            previousStatus: request.status,
            newStatus: BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'BRANCH_CASHIER_INVOICE_VISIBLE',
          entity: 'BranchInvoice',
          entityId: invoice.id,
          metadata: {
            earlyPaymentRequestId: request.id,
            approvedAmount,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createAlert(tx, user, {
        branchId: request.branchId,
        type: AlertType.BRANCH_EARLY_PAYMENT_SENT_TO_CASHIER,
        title: 'Счёт передан кассиру для досрочного погашения',
        message: `Счёт ${invoice.invoiceNumber} передан кассиру на оплату ${approvedAmount.toFixed(2)} KGS`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.CASHIER],
      });

      const updated = await tx.branchInstallmentEarlyPaymentRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: this.requestInclude(),
      });
      return this.serializeRequest(updated);
    });
  }

  async findCashierVisibleRequest(tx: PrismaTx, invoiceId: string) {
    return tx.branchInstallmentEarlyPaymentRequest.findFirst({
      where: {
        invoiceId,
        status: {
          in: [
            BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
            BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED,
          ],
        },
        sentToCashierAt: { not: null },
      },
    });
  }

  async markPaymentSubmitted(tx: PrismaTx, requestId: string) {
    await tx.branchInstallmentEarlyPaymentRequest.update({
      where: { id: requestId },
      data: { status: BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED },
    });
  }

  async completeEarlyPayment(
    tx: PrismaTx,
    user: AuthUser,
    requestId: string,
    paymentAmount: number,
    invoice: { id: string; invoiceNumber: string; branchId: string; debtAmount: Prisma.Decimal },
    installment: { id: string; termMonths: number; installmentDueDate: Date | null },
  ) {
    const request = await tx.branchInstallmentEarlyPaymentRequest.findUniqueOrThrow({
      where: { id: requestId },
    });

    const newRemainingDebt = this.roundMoney(Math.max(Number(invoice.debtAmount), 0));
    const paymentSchedule =
      newRemainingDebt > 0
        ? buildBranchOrderInstallmentSchedule(
            newRemainingDebt,
            installment.termMonths,
            installment.installmentDueDate,
          )
        : [];

    await tx.branchInstallmentEarlyPaymentRequest.update({
      where: { id: requestId },
      data: { status: BranchInstallmentEarlyPaymentStatus.PAYMENT_CONFIRMED },
    });

    await tx.branchInvoice.update({
      where: { id: invoice.id },
      data: { sentToCashierAt: null },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'EARLY_PAYMENT_CONFIRMED',
        entity: 'BranchInstallmentEarlyPaymentRequest',
        entityId: requestId,
        metadata: {
          invoiceId: invoice.id,
          installmentId: request.installmentId,
          branchId: invoice.branchId,
          confirmedPaymentAmount: paymentAmount,
          remainingDebt: newRemainingDebt,
          paymentSchedule,
          roles: user.roles ?? [user.role],
        },
      },
    });

    if (newRemainingDebt > 0) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INSTALLMENT_SCHEDULE_RECALCULATED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId: invoice.id,
            remainingDebt: newRemainingDebt,
            paymentSchedule,
            roles: user.roles ?? [user.role],
          },
        },
      });
    } else {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'INSTALLMENT_CLOSED',
          entity: 'BranchOrderInstallment',
          entityId: installment.id,
          metadata: {
            invoiceId: invoice.id,
            roles: user.roles ?? [user.role],
          },
        },
      });

      await this.createAlert(tx, user, {
        branchId: invoice.branchId,
        type: AlertType.INSTALLMENT_FULLY_PAID,
        title: 'Рассрочка полностью погашена',
        message: `Рассрочка по счёту ${invoice.invoiceNumber} полностью погашена`,
        entityType: 'BranchInvoice',
        entityId: invoice.id,
        recipientRoles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER],
      });
    }

    await this.createAlert(tx, user, {
      branchId: invoice.branchId,
      type: AlertType.BRANCH_EARLY_PAYMENT_CONFIRMED,
      title: 'Досрочное погашение подтверждено',
      message: `Досрочное погашение по счёту ${invoice.invoiceNumber} подтверждено`,
      entityType: 'BranchInstallmentEarlyPaymentRequest',
      entityId: requestId,
      recipientRoles: [Role.ACCOUNTANT, Role.FRANCHISE_OWNER],
    });
  }

  private async createAlert(
    tx: PrismaTx,
    user: AuthUser,
    payload: {
      branchId: string | null;
      type: AlertType;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
      recipientRoles: Role[];
    },
  ) {
    const roles = resolveUserRoles(user);
    void roles;
    await this.notificationsService.notifyInTx(tx, user, {
      type: payload.type,
      branchId: payload.branchId,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType,
      entityId: payload.entityId,
      recipientRoles: payload.recipientRoles,
    });
  }
}
