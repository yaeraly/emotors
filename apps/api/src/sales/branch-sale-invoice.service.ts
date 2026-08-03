import { Injectable } from '@nestjs/common';
import {
  AlertType,
  BranchInvoiceCategory,
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  Prisma,
  Role,
  SalePaymentType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class BranchSaleInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async generateInvoiceNumber(tx: PrismaTx) {
    const count = await tx.branchInvoice.count();
    return `BI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;
  }

  async ensureRetailSaleInvoiceInTx(
    tx: PrismaTx,
    user: AuthUser,
    sale: {
      id: string;
      branchId: string;
      receiptNumber: string;
      totalAmount: Prisma.Decimal | number;
      saleDate: Date;
    },
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: { saleId: sale.id, deletedAt: null },
    });
    if (existing) {
      if (!existing.sentToCashierAt) {
        const now = new Date();
        return tx.branchInvoice.update({
          where: { id: existing.id },
          data: {
            sentToBranchAt: existing.sentToBranchAt ?? now,
            sentToCashierAt: now,
            paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
            totalAmount: sale.totalAmount,
            paidAmount: 0,
            debtAmount: sale.totalAmount,
            status: BranchInvoiceStatus.ISSUED,
          },
        });
      }
      return existing;
    }

    const totalAmount = Number(sale.totalAmount);
    const now = new Date();
    const invoice = await tx.branchInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        branchId: sale.branchId,
        saleId: sale.id,
        invoiceCategory: BranchInvoiceCategory.RETAIL_SALE,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        dueDate: sale.saleDate,
        issuedAt: now,
        sentToBranchAt: now,
        sentToCashierAt: now,
        createdById: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_INVOICE_CREATED',
        entity: 'BranchInvoice',
        entityId: invoice.id,
        metadata: {
          saleId: sale.id,
          branchId: sale.branchId,
          invoiceId: invoice.id,
          saleTotal: totalAmount,
          paymentType: SalePaymentType.FULL_PAYMENT,
          roles: user.roles ?? [user.role],
        },
      },
    });

    return invoice;
  }

  async ensureRetailInstallmentInvoiceInTx(
    tx: PrismaTx,
    user: AuthUser,
    sale: {
      id: string;
      branchId: string;
      receiptNumber: string;
      totalAmount: Prisma.Decimal | number;
      saleDate: Date;
      dueDate?: Date | null;
    },
  ) {
    const existing = await tx.branchInvoice.findFirst({
      where: { saleId: sale.id, deletedAt: null },
    });
    if (existing) {
      const totalAmount = Number(sale.totalAmount);
      return tx.branchInvoice.update({
        where: { id: existing.id },
        data: {
          invoiceCategory: BranchInvoiceCategory.RETAIL_SALE,
          paymentType: BranchInvoicePaymentType.INSTALLMENT,
          totalAmount,
          paidAmount: 0,
          debtAmount: totalAmount,
          status: BranchInvoiceStatus.ISSUED,
          sentToBranchAt: existing.sentToBranchAt ?? new Date(),
          sentToCashierAt: null,
          dueDate: sale.dueDate ?? sale.saleDate,
        },
      });
    }

    const totalAmount = Number(sale.totalAmount);
    const now = new Date();
    const invoice = await tx.branchInvoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(tx),
        branchId: sale.branchId,
        saleId: sale.id,
        invoiceCategory: BranchInvoiceCategory.RETAIL_SALE,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        dueDate: sale.dueDate ?? sale.saleDate,
        issuedAt: now,
        sentToBranchAt: now,
        sentToCashierAt: null,
        createdById: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_INVOICE_CREATED',
        entity: 'BranchInvoice',
        entityId: invoice.id,
        metadata: {
          saleId: sale.id,
          branchId: sale.branchId,
          invoiceId: invoice.id,
          saleTotal: totalAmount,
          paymentType: SalePaymentType.INSTALLMENT,
          roles: user.roles ?? [user.role],
        },
      },
    });

    return invoice;
  }

  async notifyAccountantInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      branchId: string;
      saleId: string;
      invoiceId: string;
      invoiceNumber: string;
      customerName: string;
      saleTotal: number;
      initialPayment: number;
      remainingDebt: number;
    },
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'INSTALLMENT_SENT_TO_ACCOUNTANT',
        entity: 'BranchInvoice',
        entityId: input.invoiceId,
        metadata: {
          saleId: input.saleId,
          invoiceId: input.invoiceId,
          branchId: input.branchId,
          saleTotal: input.saleTotal,
          initialPayment: input.initialPayment,
          remainingDebt: input.remainingDebt,
          paymentType: SalePaymentType.INSTALLMENT,
          roles: user.roles ?? [user.role],
        },
      },
    });

    await this.notificationsService.notifyInTx(tx, user, {
      branchId: input.branchId,
      type: AlertType.BRANCH_INVOICE_CREATED,
      title: 'Счёт по рассрочке для проверки',
      message: `Счёт ${input.invoiceNumber} по рассрочке для клиента ${input.customerName} ожидает проверки бухгалтера. Сумма: ${input.saleTotal.toFixed(2)} сом. Первоначальный взнос: ${input.initialPayment.toFixed(2)} сом. Остаток: ${input.remainingDebt.toFixed(2)} сом.`,
      entityType: 'BranchInvoice',
      entityId: input.invoiceId,
      recipientRoles: [Role.ACCOUNTANT],
    });
  }

  async sendRetailInstallmentToCashierInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      branchId: string;
      saleId: string;
      invoiceId: string;
      invoiceNumber: string;
    },
  ) {
    const now = new Date();
    await tx.branchInvoice.update({
      where: { id: input.invoiceId },
      data: { sentToCashierAt: now },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'INSTALLMENT_SENT_TO_CASHIER',
        entity: 'BranchInvoice',
        entityId: input.invoiceId,
        metadata: {
          saleId: input.saleId,
          invoiceId: input.invoiceId,
          branchId: input.branchId,
          paymentType: SalePaymentType.INSTALLMENT,
          actor: user.id,
          actorRole: user.role,
          timestamp: now.toISOString(),
          roles: user.roles ?? [user.role],
        },
      },
    });

    await this.notificationsService.notifyInTx(tx, user, {
      branchId: input.branchId,
      type: AlertType.BRANCH_INVOICE_CREATED,
      title: 'Рассрочка передана кассиру',
      message: 'Новая рассрочка ожидает приема платежей.',
      entityType: 'BranchInvoice',
      entityId: input.invoiceId,
      recipientRoles: [Role.CASHIER],
    });
  }

  async notifyCashierInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      branchId: string;
      saleId: string;
      invoiceId: string;
      invoiceNumber: string;
      customerId: string;
      saleTotal: number;
      receivedAmount?: number;
      expectedChange?: number;
    },
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_INVOICE_SENT_TO_CASHIER',
        entity: 'BranchInvoice',
        entityId: input.invoiceId,
        metadata: {
          saleId: input.saleId,
          invoiceId: input.invoiceId,
          branchId: input.branchId,
          customerId: input.customerId,
          saleTotal: input.saleTotal,
          receivedAmount: input.receivedAmount ?? input.saleTotal,
          expectedChange: input.expectedChange ?? 0,
          paymentType: SalePaymentType.FULL_PAYMENT,
          roles: user.roles ?? [user.role],
        },
      },
    });

    await this.notificationsService.notifyInTx(tx, user, {
      branchId: input.branchId,
      type: AlertType.BRANCH_INVOICE_CREATED,
      title: 'Счёт передан кассиру',
      message: `Счёт ${input.invoiceNumber} по продаже передан кассиру на оплату. Сумма: ${input.saleTotal.toFixed(2)} сом. Получено: ${(input.receivedAmount ?? input.saleTotal).toFixed(2)} сом.${(input.expectedChange ?? 0) > 0 ? ` Сдача: ${input.expectedChange!.toFixed(2)} сом.` : ''}`,
      entityType: 'BranchInvoice',
      entityId: input.invoiceId,
      recipientRoles: [Role.CASHIER],
    });
  }
}
