import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
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
import { RejectSaleInstallmentDto } from './dto/reject-sale-installment.dto';

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
  } | null;
};

@Injectable()
export class SaleInstallmentApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  saleRequiresInstallmentApproval(sale: {
    debtAmount: Prisma.Decimal | number;
    installments?: unknown[];
  }) {
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
    submittedBy?: { id: string; fullName: string; role: string } | null;
    approvedBy?: { id: string; fullName: string; role: string } | null;
    rejectedBy?: { id: string; fullName: string; role: string } | null;
    id: string;
    saleId: string;
    branchId: string;
  }) {
    return {
      ...approval,
      totalAmount: Number(approval.totalAmount),
      initialPayment: Number(approval.initialPayment),
      financedAmount: Number(approval.financedAmount),
    };
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
            SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
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
      if (!this.saleRequiresInstallmentApproval(sale)) {
        throw new BadRequestException('Продажа не является рассрочкой');
      }
      if (sale.status !== SaleStatus.DRAFT && sale.status !== SaleStatus.SENT_TO_CUSTOMER) {
        throw new ConflictException('Нельзя отправить заявку для завершённой продажи');
      }

      const terms = this.buildTermsSnapshot(sale);
      const financedAmount = this.roundMoney(Number(sale.debtAmount));
      const initialPayment = this.roundMoney(Number(sale.paidAmount));
      const installment = sale.installments[0];
      const existing = sale.installmentApproval;

      const approval = existing
        ? await tx.saleInstallmentApproval.update({
            where: { id: existing.id },
            data: {
              status: SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
              requestVersion: existing.status === SaleInstallmentApprovalStatus.REJECTED
                ? existing.requestVersion + 1
                : existing.requestVersion,
              termsSnapshot: terms.snapshot,
              totalAmount: Number(sale.totalAmount),
              initialPayment,
              financedAmount,
              installmentDays: this.deriveInstallmentDays(sale),
              dueDate: installment?.dueDate ?? null,
              paymentCount: sale.installments.length,
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
          })
        : await tx.saleInstallmentApproval.create({
            data: {
              saleId: sale.id,
              branchId: sale.branchId,
              requestNumber: await this.generateRequestNumber(tx, sale.branchId),
              status: SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
              termsSnapshot: terms.snapshot,
              totalAmount: Number(sale.totalAmount),
              initialPayment,
              financedAmount,
              installmentDays: this.deriveInstallmentDays(sale),
              dueDate: installment?.dueDate ?? null,
              paymentCount: sale.installments.length,
              notes: sale.notes,
              submittedById: user.id,
              submittedAt: new Date(),
            },
            include: this.installmentApprovalInclude(),
          });

      await this.auditInTx(tx, user, sale.branchId, 'SALE_INSTALLMENT_REQUEST_SUBMITTED', 'SaleInstallmentApproval', approval.id, {
        saleId: sale.id,
        requestVersion: approval.requestVersion,
      });

      await this.notificationsService.notifyInTx(tx, user, {
        type: AlertType.SALE_INSTALLMENT_REQUESTED,
        branchId: sale.branchId,
        title: 'Новая заявка на рассрочку',
        message: `Новая заявка на рассрочку №${approval.requestNumber} от менеджера ${user.fullName}. Клиент: ${sale.customer.fullName}. Сумма: ${Number(sale.totalAmount).toFixed(2)}.`,
        entityType: 'Sale',
        entityId: sale.id,
        referenceNumber: approval.requestNumber,
        recipientRoles: [Role.FRANCHISE_OWNER],
      });

      return this.serializeApproval(approval);
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
      if (approval.status !== SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL) {
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
      if (approval.status !== SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL) {
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

  async assertCanFinalizeInstallmentSale(tx: PrismaTx, sale: SaleWithApprovalContext) {
    if (!this.saleRequiresInstallmentApproval(sale)) {
      return;
    }
    const approval = sale.installmentApproval;
    if (!approval || approval.status !== SaleInstallmentApprovalStatus.APPROVED) {
      throw new BadRequestException('Рассрочка должна быть одобрена руководителем филиала');
    }
    this.assertTermsMatch(sale, approval);
  }

  async invalidateApprovalIfTermsChanged(tx: PrismaTx, user: AuthUser, sale: SaleWithApprovalContext) {
    const approval = sale.installmentApproval;
    if (!approval) return;
    if (
      approval.status !== SaleInstallmentApprovalStatus.APPROVED &&
      approval.status !== SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL
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

  private buildTermsSnapshot(sale: SaleWithApprovalContext) {
    const payload = {
      customerId: sale.customerId,
      totalAmount: Number(sale.totalAmount),
      paidAmount: Number(sale.paidAmount),
      debtAmount: Number(sale.debtAmount),
      notes: sale.notes ?? '',
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      installments: sale.installments.map((item) => ({
        dueDate: item.dueDate.toISOString(),
        amount: Number(item.amount),
      })),
    };
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
