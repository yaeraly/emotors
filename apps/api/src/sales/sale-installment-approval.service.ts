import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  Role,
  SaleInstallmentApprovalStatus,
  SaleStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isBranchOwnerUser,
  isBranchSalesManagerUser,
} from '../rbac/rbac';
import { ReceiveInstallmentPaymentDto } from './dto/receive-installment-payment.dto';
import { RejectSaleInstallmentDto } from './dto/reject-sale-installment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';

type PrismaTx = Prisma.TransactionClient;

type SaleWithApprovalContext = {
  id: string;
  branchId: string;
  customerId: string;
  receiptNumber: string;
  status: SaleStatus;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  debtAmount: Prisma.Decimal;
  notes: string | null;
  sellerId: string;
  seller: { fullName: string };
  customer: { fullName: string };
  items: Array<{
    productId: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }>;
  installments: Array<{
    dueDate: Date;
    amount: Prisma.Decimal;
  }>;
  installmentApproval?: {
    id: string;
    status: SaleInstallmentApprovalStatus;
    requestVersion: number;
    termsSnapshot: Prisma.JsonValue;
    initialPayment: Prisma.Decimal;
    financedAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    dueDate?: Date | null;
  } | null;
};

const PENDING_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.PENDING_APPROVAL,
  SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
];

@Injectable()
export class SaleInstallmentApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  saleRequiresInstallmentApproval(sale: {
    debtAmount?: Prisma.Decimal | number;
    installments?: unknown[];
    installmentApproval?: { id: string } | null;
  }) {
    if (sale.installmentApproval) {
      return true;
    }
    return Number(sale.debtAmount) > 0.009 && (sale.installments?.length ?? 0) > 0;
  }

  saleIsFullPayment(sale: { debtAmount: Prisma.Decimal | number }) {
    return Number(sale.debtAmount) <= 0.009;
  }

  installmentApprovalInclude() {
    return {
      submittedBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
      rejectedBy: { select: { id: true, fullName: true, role: true } },
    };
  }

  serializeApproval(approval: {
    totalAmount: Prisma.Decimal;
    initialPayment: Prisma.Decimal;
    financedAmount: Prisma.Decimal;
    installmentPaidAmount?: Prisma.Decimal;
    remainingDebt?: Prisma.Decimal | null;
    installmentDays: number | null;
    dueDate: Date | null;
    paymentCount: number;
    notes: string | null;
    status: SaleInstallmentApprovalStatus;
    requestVersion: number;
    requestNumber: string;
    submittedAt: Date | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    submittedBy?: { id: string; fullName: string; role?: string } | null;
    approvedBy?: { id: string; fullName: string; role?: string } | null;
    rejectedBy?: { id: string; fullName: string; role?: string } | null;
    id: string;
    saleId: string;
    branchId: string;
  }) {
    const totalAmount = Number(approval.totalAmount);
    const installmentPaidAmount = Number(approval.installmentPaidAmount ?? approval.initialPayment);
    const remainingDebt =
      approval.remainingDebt != null
        ? Number(approval.remainingDebt)
        : Math.max(totalAmount - installmentPaidAmount, 0);

    return {
      ...approval,
      installmentNumber: approval.requestNumber,
      totalAmount,
      initialPayment: Number(approval.initialPayment),
      downPayment: Number(approval.initialPayment),
      financedAmount: Number(approval.financedAmount),
      installmentPaidAmount,
      paidAmount: installmentPaidAmount,
      remainingDebt,
    };
  }

  async syncInstallmentDraftFromSale(
    tx: PrismaTx,
    user: AuthUser,
    sale: { id: string; branchId: string },
    dto: CreateSaleDto,
    totalAmount: number,
  ) {
    if (dto.paymentType !== 'INSTALLMENT') {
      return null;
    }

    const downPayment = this.roundMoney(dto.downPayment ?? 0);
    if (downPayment < 0) {
      throw new BadRequestException('Первоначальный взнос не может быть отрицательным');
    }
    if (downPayment > totalAmount + 0.009) {
      throw new BadRequestException('Первоначальный взнос не может превышать сумму продажи');
    }
    if (!dto.dueDate) {
      throw new BadRequestException('Укажите дату окончательного платежа');
    }

    const remainingDebt = this.roundMoney(totalAmount - downPayment);
    const terms = this.buildSimpleTermsSnapshot({
      customerId: dto.customerId,
      totalAmount,
      downPayment,
      remainingDebt,
      finalPaymentDate: dto.dueDate.toISOString(),
      notes: dto.notes ?? '',
      items: dto.items.map((item) => ({
        productId: item.productId ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });

    const existing = await tx.saleInstallmentApproval.findUnique({
      where: { saleId: sale.id },
    });

    const data = {
      termsSnapshot: terms.snapshot,
      totalAmount,
      initialPayment: downPayment,
      financedAmount: remainingDebt,
      remainingDebt,
      installmentPaidAmount: 0,
      dueDate: dto.dueDate,
      installmentDays: null,
      paymentCount: 1,
      notes: dto.notes ?? null,
    };

    if (existing) {
      return tx.saleInstallmentApproval.update({
        where: { id: existing.id },
        data: {
          ...data,
          status:
            existing.status === SaleInstallmentApprovalStatus.REJECTED
              ? SaleInstallmentApprovalStatus.DRAFT
              : existing.status,
        },
        include: this.installmentApprovalInclude(),
      });
    }

    return tx.saleInstallmentApproval.create({
      data: {
        saleId: sale.id,
        branchId: sale.branchId,
        requestNumber: await this.generateRequestNumber(tx, sale.branchId),
        status: SaleInstallmentApprovalStatus.DRAFT,
        ...data,
      },
      include: this.installmentApprovalInclude(),
    });
  }

  async listInstallmentRequests(user: AuthUser) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Недостаточно прав для просмотра заявок на рассрочку');
    }
    const rows = await this.prisma.saleInstallmentApproval.findMany({
      where: {
        branchId: user.branchId!,
        status: {
          in: [
            ...PENDING_STATUSES,
            SaleInstallmentApprovalStatus.APPROVED,
            SaleInstallmentApprovalStatus.REJECTED,
          ],
        },
      },
      include: {
        sale: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            seller: { select: { id: true, fullName: true } },
          },
        },
        submittedBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
        rejectedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      ...this.serializeApproval(row),
      sale: {
        ...row.sale,
        totalAmount: Number(row.sale.totalAmount),
        paidAmount: Number(row.sale.paidAmount),
        debtAmount: Number(row.sale.debtAmount),
      },
    }));
  }

  async submitInstallmentRequest(user: AuthUser, saleId: string) {
    if (!isBranchSalesManagerUser(user)) {
      throw new ForbiddenException('Недостаточно прав отправлять заявку на рассрочку');
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleForApproval(tx, user, saleId);
      const approval = sale.installmentApproval;
      if (!approval) {
        throw new BadRequestException('Заполните условия рассрочки');
      }
      if (sale.status !== SaleStatus.DRAFT && sale.status !== SaleStatus.SENT_TO_CUSTOMER) {
        throw new ConflictException('Нельзя отправить заявку для завершённой продажи');
      }

      const terms = this.buildTermsSnapshot(sale, {
        initialPayment: approval.initialPayment,
        financedAmount: approval.financedAmount,
        dueDate: approval.dueDate ?? null,
      });
      const downPayment = this.roundMoney(Number(approval.initialPayment));
      const remainingDebt = this.roundMoney(Number(approval.financedAmount));
      const existing = approval;

      const updatedApproval = await tx.saleInstallmentApproval.update({
        where: { id: existing.id },
        data: {
          status: SaleInstallmentApprovalStatus.PENDING_APPROVAL,
          requestVersion:
            existing.status === SaleInstallmentApprovalStatus.REJECTED
              ? existing.requestVersion + 1
              : existing.requestVersion,
          termsSnapshot: terms.snapshot,
          totalAmount: Number(sale.totalAmount),
          initialPayment: downPayment,
          financedAmount: remainingDebt,
          remainingDebt,
          dueDate: approval.dueDate,
          notes: sale.notes,
          submittedById: user.id,
          submittedAt: new Date(),
          approvedById: null,
          approvedAt: null,
          rejectedById: null,
          rejectedAt: null,
          rejectionReason: null,
        },
        include: this.installmentApprovalInclude(),
      });

      await this.auditInTx(tx, user, sale.branchId, 'BRANCH_INSTALLMENT_SUBMITTED_FOR_APPROVAL', 'SaleInstallmentApproval', updatedApproval.id, {
        saleId: sale.id,
        requestVersion: updatedApproval.requestVersion,
        previousStatus: approval.status,
        newStatus: updatedApproval.status,
        paymentType: 'INSTALLMENT',
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SALE_INSTALLMENT_REQUESTED,
        branchId: sale.branchId,
        title: 'Новая заявка на рассрочку',
        message: `Новая заявка на рассрочку №${updatedApproval.requestNumber} от менеджера ${user.fullName}. Клиент: ${sale.customer.fullName}. Сумма: ${Number(sale.totalAmount).toFixed(2)}.`,
        entityType: 'Sale',
        entityId: sale.id,
        referenceNumber: updatedApproval.requestNumber,
        recipientRoles: [Role.FRANCHISE_OWNER],
      });

      return this.serializeApproval(updatedApproval);
    });
  }

  async approveInstallmentRequest(user: AuthUser, saleId: string) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Недостаточно прав одобрять рассрочку');
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleForApproval(tx, user, saleId);
      const approval = sale.installmentApproval;
      if (!approval) {
        throw new NotFoundException('Заявка на рассрочку не найдена');
      }
      if (!PENDING_STATUSES.includes(approval.status)) {
        throw new ConflictException('Заявка уже рассмотрена');
      }
      this.assertTermsMatch(sale, approval);

      const updated = await tx.saleInstallmentApproval.update({
        where: { id: approval.id },
        data: {
          status: SaleInstallmentApprovalStatus.APPROVED,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: this.installmentApprovalInclude(),
      });

      await this.auditInTx(tx, user, sale.branchId, 'SALE_INSTALLMENT_APPROVED', 'SaleInstallmentApproval', updated.id, {
        saleId: sale.id,
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SALE_INSTALLMENT_APPROVED,
        branchId: sale.branchId,
        title: 'Рассрочка одобрена',
        message: `Заявка на рассрочку №${updated.requestNumber} одобрена.`,
        entityType: 'Sale',
        entityId: sale.id,
        referenceNumber: updated.requestNumber,
        recipientRoles: [Role.MANAGER],
      });

      return this.serializeApproval(updated);
    });
  }

  async rejectInstallmentRequest(user: AuthUser, saleId: string, dto: RejectSaleInstallmentDto) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Недостаточно прав отклонять рассрочку');
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getSaleForApproval(tx, user, saleId);
      const approval = sale.installmentApproval;
      if (!approval) {
        throw new NotFoundException('Заявка на рассрочку не найдена');
      }
      if (!PENDING_STATUSES.includes(approval.status)) {
        throw new ConflictException('Заявка уже рассмотрена');
      }

      const updated = await tx.saleInstallmentApproval.update({
        where: { id: approval.id },
        data: {
          status: SaleInstallmentApprovalStatus.REJECTED,
          rejectedById: user.id,
          rejectedAt: new Date(),
          rejectionReason: dto.rejectionReason.trim(),
        },
        include: this.installmentApprovalInclude(),
      });

      await this.auditInTx(tx, user, sale.branchId, 'SALE_INSTALLMENT_REJECTED', 'SaleInstallmentApproval', updated.id, {
        saleId: sale.id,
        rejectionReason: dto.rejectionReason.trim(),
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SALE_INSTALLMENT_REJECTED,
        branchId: sale.branchId,
        title: 'Рассрочка отклонена',
        message: `Заявка на рассрочку №${updated.requestNumber} отклонена. Причина: ${dto.rejectionReason.trim()}.`,
        entityType: 'Sale',
        entityId: sale.id,
        referenceNumber: updated.requestNumber,
        recipientRoles: [Role.MANAGER],
      });

      return this.serializeApproval(updated);
    });
  }

  async activateOnSaleFinalize(tx: PrismaTx, user: AuthUser, saleId: string) {
    const approval = await tx.saleInstallmentApproval.findUnique({
      where: { saleId },
    });
    if (!approval || approval.status !== SaleInstallmentApprovalStatus.APPROVED) {
      return null;
    }

    const downPayment = this.roundMoney(Number(approval.initialPayment));
    const totalAmount = this.roundMoney(Number(approval.totalAmount));
    const remainingDebt = this.roundMoney(totalAmount - downPayment);

    const updated = await tx.saleInstallmentApproval.update({
      where: { id: approval.id },
      data: {
        status: SaleInstallmentApprovalStatus.ACTIVE,
        installmentPaidAmount: downPayment,
        remainingDebt,
      },
      include: this.installmentApprovalInclude(),
    });

    if (downPayment > 0) {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
      await tx.saleInstallmentPayment.create({
        data: {
          installmentApprovalId: approval.id,
          branchId: sale.branchId,
          amount: downPayment,
          method: PaymentMethod.CASH,
          note: 'Первоначальный взнос',
          paidAfterTotal: downPayment,
          remainingAfter: remainingDebt,
          createdById: user.id,
        },
      });
    }

    await this.auditInTx(tx, user, approval.branchId, 'SALE_INSTALLMENT_ACTIVATED', 'SaleInstallmentApproval', approval.id, {
      saleId,
      downPayment,
      remainingDebt,
    });

    return updated;
  }

  async listBranchInstallments(user: AuthUser, statusFilter?: 'active' | 'closed') {
    if (!user.branchId && !isBranchOwnerUser(user) && !isBranchSalesManagerUser(user)) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const statuses =
      statusFilter === 'closed'
        ? [SaleInstallmentApprovalStatus.PAID, SaleInstallmentApprovalStatus.CANCELLED]
        : [SaleInstallmentApprovalStatus.ACTIVE];

    const rows = await this.prisma.saleInstallmentApproval.findMany({
      where: {
        branchId: user.branchId!,
        status: { in: statuses },
      },
      include: {
        sale: {
          select: {
            id: true,
            receiptNumber: true,
            customer: { select: { id: true, fullName: true, phone: true } },
            seller: { select: { id: true, fullName: true } },
          },
        },
        submittedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return rows.map((row) => ({
      ...this.serializeApproval(row),
      sale: {
        id: row.sale.id,
        receiptNumber: row.sale.receiptNumber,
        customer: row.sale.customer,
        seller: row.sale.seller,
      },
      manager: row.submittedBy,
    }));
  }

  async findInstallment(user: AuthUser, id: string) {
    const row = await this.prisma.saleInstallmentApproval.findFirst({
      where: {
        id,
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      include: {
        sale: {
          include: {
            customer: true,
            seller: { select: { id: true, fullName: true } },
            items: true,
          },
        },
        submittedBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true } },
        payments: {
          include: { createdBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Рассрочка не найдена');
    }

    return {
      ...this.serializeApproval(row),
      sale: {
        ...row.sale,
        totalAmount: Number(row.sale.totalAmount),
        paidAmount: Number(row.sale.paidAmount),
        debtAmount: Number(row.sale.debtAmount),
        items: row.sale.items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
      },
      manager: row.submittedBy,
      paymentHistory: row.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        note: payment.note,
        paidAfterTotal: Number(payment.paidAfterTotal),
        remainingAfter: Number(payment.remainingAfter),
        createdAt: payment.createdAt,
        createdBy: payment.createdBy,
      })),
    };
  }

  async receiveInstallmentPayment(user: AuthUser, id: string, dto: ReceiveInstallmentPaymentDto) {
    if (!isBranchSalesManagerUser(user) && !isBranchOwnerUser(user)) {
      throw new ForbiddenException('Недостаточно прав принимать платежи по рассрочке');
    }

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.saleInstallmentApproval.findFirst({
        where: {
          id,
          ...(user.branchId ? { branchId: user.branchId } : {}),
        },
        include: { sale: true },
      });

      if (!approval) {
        throw new NotFoundException('Рассрочка не найдена');
      }
      if (approval.status !== SaleInstallmentApprovalStatus.ACTIVE) {
        throw new ConflictException('Платежи принимаются только по активной рассрочке');
      }

      const amount = this.roundMoney(dto.amount);
      if (amount <= 0) {
        throw new BadRequestException('Сумма платежа должна быть больше нуля');
      }

      const currentRemaining = this.roundMoney(
        Number(approval.remainingDebt ?? approval.financedAmount),
      );
      if (amount > currentRemaining + 0.009) {
        throw new BadRequestException(
          `Максимальная сумма платежа: ${currentRemaining.toFixed(2)}.`,
        );
      }

      const paidAfterTotal = this.roundMoney(Number(approval.installmentPaidAmount) + amount);
      const remainingAfter = this.roundMoney(Number(approval.totalAmount) - paidAfterTotal);
      const nextStatus =
        remainingAfter <= 0.009
          ? SaleInstallmentApprovalStatus.PAID
          : SaleInstallmentApprovalStatus.ACTIVE;

      await tx.payment.create({
        data: {
          branchId: approval.branchId,
          saleId: approval.saleId,
          customerId: approval.sale.customerId,
          amount,
          method: dto.method,
          note: dto.note?.trim() || 'Платеж по рассрочке',
          createdById: user.id,
          status: PaymentRecordStatus.ACTIVE,
        },
      });

      const paymentAggregate = await tx.payment.aggregate({
        where: { saleId: approval.saleId, status: PaymentRecordStatus.ACTIVE },
        _sum: { amount: true },
      });
      const salePaid = this.roundMoney(Number(paymentAggregate._sum.amount ?? 0));
      const saleTotal = this.roundMoney(Number(approval.sale.totalAmount));
      await tx.sale.update({
        where: { id: approval.saleId },
        data: {
          paidAmount: salePaid,
          debtAmount: Math.max(saleTotal - salePaid, 0),
          paymentStatus:
            salePaid >= saleTotal - 0.009
              ? 'PAID'
              : salePaid > 0
                ? 'PARTIAL'
                : 'DEBT',
        },
      });

      await tx.saleInstallmentPayment.create({
        data: {
          installmentApprovalId: approval.id,
          branchId: approval.branchId,
          amount,
          method: dto.method,
          note: dto.note?.trim() || null,
          paidAfterTotal,
          remainingAfter: Math.max(remainingAfter, 0),
          createdById: user.id,
        },
      });

      const updated = await tx.saleInstallmentApproval.update({
        where: { id: approval.id },
        data: {
          installmentPaidAmount: paidAfterTotal,
          remainingDebt: Math.max(remainingAfter, 0),
          status: nextStatus,
        },
        include: this.installmentApprovalInclude(),
      });

      await this.auditInTx(tx, user, approval.branchId, 'SALE_INSTALLMENT_PAYMENT_ADDED', 'SaleInstallmentApproval', approval.id, {
        amount,
        paidAfterTotal,
        remainingAfter,
      });

      if (nextStatus === SaleInstallmentApprovalStatus.PAID) {
        await this.auditInTx(tx, user, approval.branchId, 'SALE_INSTALLMENT_CLOSED', 'SaleInstallmentApproval', approval.id, {
          saleId: approval.saleId,
        });
        await this.notificationsService.notifyInTx(tx, user, {
          type: AlertType.SALE_INSTALLMENT_PAID,
          branchId: approval.branchId,
          title: 'Рассрочка погашена',
          message: `Рассрочка №${approval.requestNumber} полностью оплачена.`,
          entityType: 'SaleInstallmentApproval',
          entityId: approval.id,
          referenceNumber: approval.requestNumber,
          recipientRoles: [Role.MANAGER, Role.FRANCHISE_OWNER],
        });
      }

      return this.serializeApproval(updated);
    });
  }

  async assertCanFinalizeInstallmentSale(tx: PrismaTx, sale: SaleWithApprovalContext) {
    if (!this.saleRequiresInstallmentApproval(sale)) {
      return;
    }
    const approval = sale.installmentApproval;
    if (!approval || approval.status !== SaleInstallmentApprovalStatus.APPROVED) {
      throw new BadRequestException('Рассрочка должна быть одобрена руководителем филиала');
    }

    const downPayment = this.roundMoney(Number(approval.initialPayment));
    if (Number(sale.paidAmount) + 0.009 < downPayment) {
      throw new BadRequestException('Необходимо принять первоначальный взнос перед завершением продажи');
    }

    this.assertTermsMatch(sale, approval);
  }

  async invalidateApprovalIfTermsChanged(tx: PrismaTx, user: AuthUser, sale: SaleWithApprovalContext) {
    const approval = sale.installmentApproval;
    if (!approval) return;
    if (
      approval.status !== SaleInstallmentApprovalStatus.APPROVED &&
      !PENDING_STATUSES.includes(approval.status)
    ) {
      return;
    }
    const current = this.buildTermsSnapshot(sale);
    const previousHash = this.extractSnapshotHash(approval.termsSnapshot);
    if (previousHash === current.hash) {
      return;
    }
    await tx.saleInstallmentApproval.update({
      where: { id: approval.id },
      data: {
        status: SaleInstallmentApprovalStatus.DRAFT,
        requestVersion: approval.requestVersion + 1,
        termsSnapshot: current.snapshot,
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        submittedById: null,
        submittedAt: null,
      },
    });
    await this.auditInTx(tx, user, sale.branchId, 'SALE_INSTALLMENT_APPROVAL_INVALIDATED', 'SaleInstallmentApproval', approval.id, {
      saleId: sale.id,
      requestVersion: approval.requestVersion + 1,
    });
  }

  private async getSaleForApproval(tx: PrismaTx, user: AuthUser, saleId: string) {
    const sale = await tx.sale.findFirst({
      where: {
        id: saleId,
        deletedAt: null,
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        seller: { select: { id: true, fullName: true } },
        items: { select: { productId: true, quantity: true, unitPrice: true } },
        installments: { orderBy: { dueDate: 'asc' } },
        installmentApproval: true,
      },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale as SaleWithApprovalContext;
  }

  private buildTermsSnapshot(
    sale: SaleWithApprovalContext,
    approval?: {
      initialPayment: Prisma.Decimal;
      financedAmount: Prisma.Decimal;
      dueDate: Date | null;
    },
  ) {
    const approvalRecord = approval ?? sale.installmentApproval;
    const payload = {
      customerId: sale.customerId,
      totalAmount: Number(sale.totalAmount),
      downPayment: Number(approvalRecord?.initialPayment ?? sale.paidAmount),
      remainingDebt: Number(approvalRecord?.financedAmount ?? sale.debtAmount),
      finalPaymentDate: approvalRecord?.dueDate?.toISOString() ?? null,
      notes: sale.notes ?? '',
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
    };
    return this.buildSimpleTermsSnapshot(payload);
  }

  private buildSimpleTermsSnapshot(payload: Record<string, unknown>) {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return {
      hash,
      snapshot: { ...payload, hash },
    };
  }

  private extractSnapshotHash(snapshot: Prisma.JsonValue) {
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && 'hash' in snapshot) {
      return String((snapshot as { hash?: string }).hash ?? '');
    }
    return '';
  }

  private assertTermsMatch(
    sale: SaleWithApprovalContext,
    approval: { termsSnapshot: Prisma.JsonValue; requestVersion: number },
  ) {
    const current = this.buildTermsSnapshot(sale);
    const previousHash = this.extractSnapshotHash(approval.termsSnapshot);
    if (previousHash !== current.hash) {
      throw new ConflictException('Условия рассрочки изменились. Требуется повторная отправка на одобрение');
    }
  }

  private deriveInstallmentDays(sale: SaleWithApprovalContext) {
    const installment = sale.installments[0];
    if (!installment) return null;
    const diffMs = installment.dueDate.getTime() - Date.now();
    return Math.max(Math.ceil(diffMs / (24 * 60 * 60 * 1000)), 1);
  }

  private async generateRequestNumber(tx: PrismaTx, branchId: string) {
    const count = await tx.saleInstallmentApproval.count({ where: { branchId } });
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { code: true } });
    return `SI-${branch.code}-${String(count + 1).padStart(5, '0')}`;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    branchId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    return tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity,
        entityId,
        metadata: {
          branchId,
          roles: user.roles ?? [user.role],
          ...metadata,
        },
      },
    });
  }
}
