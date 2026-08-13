import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  CustomerStatus,
  CustomerType,
  HqB2bInstallmentStatus,
  HqB2bPaymentRequestStatus,
  HqB2bPaymentType,
  HqB2bSaleStatus,
  PaymentMethod,
  Prisma,
  Role,
  WarehouseType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canApproveHqB2bInstallment,
  canConfirmHqB2bPayment,
  canConvertCustomerToFranchise,
  canManageHqB2bSales,
  canViewHqB2bSales,
  canViewProductCost,
  hasAnyFullAccessRole,
  resolveUserRoles,
} from '../rbac/rbac';
import { sanitizeHqB2bSaleForRestrictedFinancialView } from '../rbac/hq-sales-procurement-privacy.util';
import { BranchesService } from '../branches/branches.service';
import { HqB2bPricingService, type B2bCustomerType } from './hq-b2b-pricing.service';
import { CreateHqB2bCustomerDto } from './dto/create-hq-b2b-customer.dto';
import { CreateHqB2bSaleDto } from './dto/create-hq-b2b-sale.dto';
import { ConfirmHqB2bPaymentDto } from './dto/confirm-hq-b2b-payment.dto';
import { RejectHqB2bPaymentDto } from './dto/reject-hq-b2b-payment.dto';
import { ApproveHqB2bInstallmentDto } from './dto/approve-hq-b2b-installment.dto';
import { RejectHqB2bInstallmentDto } from './dto/reject-hq-b2b-installment.dto';

type PrismaTx = Prisma.TransactionClient;

const B2B_CUSTOMER_TYPES: CustomerType[] = [CustomerType.DEALER, CustomerType.DISTRIBUTOR];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountsEqual(a: number, b: number) {
  return Math.abs(a - b) <= 0.01;
}

@Injectable()
export class HqB2bSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: HqB2bPricingService,
    private readonly notifications: NotificationsService,
    private readonly branchesService: BranchesService,
  ) {}

  async list(user: AuthUser, query?: { status?: HqB2bSaleStatus; customerType?: CustomerType }) {
    this.assertCanView(user);
    const sales = await this.prisma.hqB2bSale.findMany({
      where: {
        ...(query?.status ? { status: query.status } : {}),
        ...(query?.customerType ? { customerType: query.customerType } : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, companyName: true } },
        responsibleUser: { select: { id: true, fullName: true } },
        items: { select: { id: true, quantity: true } },
        paymentRequests: {
          where: { status: HqB2bPaymentRequestStatus.PENDING },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        installment: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      createdAt: sale.createdAt,
      customerName: sale.customerNameSnapshot,
      customerType: sale.customerType,
      itemCount: sale.items.reduce((sum, row) => sum + row.quantity, 0),
      totalAmount: Number(sale.totalAmount),
      paymentType: sale.paymentType,
      paymentStatus: this.derivePaymentStatus(sale),
      status: sale.status,
      responsibleName: sale.responsibleUser.fullName,
    }));
  }

  async findOne(user: AuthUser, id: string) {
    this.assertCanView(user);
    const sale = await this.getSaleOrThrow(id);
    if (!canViewProductCost(user)) {
      return sanitizeHqB2bSaleForRestrictedFinancialView(sale as Record<string, unknown>);
    }
    return sale;
  }

  async searchCustomers(user: AuthUser, customerType: CustomerType, search?: string) {
    this.assertCanManage(user);
    if (!B2B_CUSTOMER_TYPES.includes(customerType)) {
      throw new BadRequestException('Only Dealer and Distributor customer types are allowed');
    }
    const hqBranchId = await this.pricing.resolveHqBranchId();
    const where: Prisma.CustomerWhereInput = {
      branchId: hqBranchId,
      deletedAt: null,
      customerType,
      status: { not: CustomerStatus.ARCHIVED },
    };
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { taxId: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        companyName: true,
        customerType: true,
        totalDebtAmount: true,
        totalPurchaseAmount: true,
      },
      orderBy: { fullName: 'asc' },
      take: 30,
    });
    return rows.map((row) => ({
      ...row,
      totalDebtAmount: Number(row.totalDebtAmount),
      totalPurchaseAmount: Number(row.totalPurchaseAmount),
    }));
  }

  async createCustomer(user: AuthUser, dto: CreateHqB2bCustomerDto) {
    this.assertCanManage(user);
    if (!B2B_CUSTOMER_TYPES.includes(dto.customerType)) {
      throw new BadRequestException('HQ Sales may only create Dealer or Distributor customers');
    }
    const hqBranchId = await this.pricing.resolveHqBranchId();
    const customer = await this.prisma.customer.create({
      data: {
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        whatsappPhone: dto.additionalPhone?.trim() ?? null,
        additionalPhone: dto.additionalPhone?.trim() ?? null,
        branchId: hqBranchId,
        customerType: dto.customerType,
        companyName: dto.companyName?.trim() ?? null,
        taxId: dto.taxId?.trim() ?? null,
        region: dto.region?.trim() ?? null,
        address: dto.address?.trim() ?? null,
        contactPerson: dto.contactPerson?.trim() ?? null,
        creditLimit: dto.creditLimit ?? null,
        status: dto.status ?? CustomerStatus.ACTIVE,
        notes: dto.notes?.trim() ?? null,
      },
    });
    await this.audit(user, 'HQ_B2B_CUSTOMER_CREATED', customer.id, {
      customerId: customer.id,
      customerType: dto.customerType,
    });
    return customer;
  }

  async searchProducts(
    user: AuthUser,
    customerType: B2bCustomerType,
    search?: string,
  ) {
    this.assertCanManage(user);
    const hqBranchId = await this.pricing.resolveHqBranchId();
    const trimmed = search?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        branchId: hqBranchId,
        deletedAt: null,
        isActive: true,
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: 'insensitive' } },
                { sku: { contains: trimmed, mode: 'insensitive' } },
                { barcode: { contains: trimmed, mode: 'insensitive' } },
                { category: { contains: trimmed, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { productCategory: { select: { nameRu: true, nameEn: true } } },
      take: 40,
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      products.map(async (product) => {
        const availableQuantity = await this.resolveHqAvailableQuantity(product.id);
        const pricing = await this.pricing.resolveSellingPrice(product.id, customerType);
        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          categoryName:
            product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? product.category,
          availableQuantity,
          finalSellingPrice: pricing.priceConfigured ? pricing.finalSellingPrice : null,
          priceConfigured: pricing.priceConfigured,
          priceMissingReason: pricing.priceMissingReason,
        };
      }),
    );
  }

  async createAndSubmit(user: AuthUser, dto: CreateHqB2bSaleDto) {
    this.assertCanManage(user);
    if (!B2B_CUSTOMER_TYPES.includes(dto.customerType)) {
      throw new BadRequestException('HQ Sales may only sell to Dealer or Distributor customers');
    }
    if (dto.customerType !== dto.expectedCustomerType) {
      throw new BadRequestException('Selected customer type does not match sale customer type');
    }

    const hqBranchId = await this.pricing.resolveHqBranchId();
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null, branchId: hqBranchId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.customerType !== dto.customerType) {
      throw new BadRequestException('Customer type does not match selected sale type');
    }
    if (!dto.items.length) throw new BadRequestException('Sale must include at least one product');

    const built = await this.buildSaleItems(dto.customerType as B2bCustomerType, dto.items);

    return this.prisma.$transaction(async (tx) => {
      const saleNumber = await this.generateSaleNumber(tx);
      const totalAmount = roundMoney(built.reduce((sum, row) => sum + row.lineTotal, 0));
      if (totalAmount <= 0) throw new BadRequestException('Sale total must be positive');

      const initialStatus =
        dto.paymentType === HqB2bPaymentType.INSTALLMENT
          ? HqB2bSaleStatus.AWAITING_CEO_APPROVAL
          : HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION;

      const sale = await tx.hqB2bSale.create({
        data: {
          saleNumber,
          hqBranchId,
          customerId: customer.id,
          customerType: dto.customerType,
          customerNameSnapshot: customer.fullName,
          customerPhoneSnapshot: customer.phone,
          customerCompanySnapshot: customer.companyName,
          paymentType: dto.paymentType,
          status: initialStatus,
          totalAmount,
          pricingPolicyVersionId: built[0]?.pricingPolicyVersionId ?? null,
          createdById: user.id,
          responsibleUserId: user.id,
          notes: dto.notes?.trim() ?? null,
          submittedAt: new Date(),
          items: {
            create: built.map((row) => ({
              productId: row.productId,
              productNameSnapshot: row.productName,
              skuSnapshot: row.sku,
              categoryNameSnapshot: row.categoryName,
              quantity: row.quantity,
              unitPrice: row.unitPrice,
              lineTotal: row.lineTotal,
              costPriceSnapshot: row.costPrice,
              basePriceSnapshot: row.basePrice,
              pricingPolicyVersionId: row.pricingPolicyVersionId,
              pricingProfileId: row.priceProfileId,
              pricingSource: row.pricingSource,
              appliedRuleType: row.appliedRuleType,
              appliedRuleId: row.appliedRuleId,
              priceResolvedAt: new Date(),
            })),
          },
        },
        include: { items: true, installment: true },
      });

      if (dto.paymentType === HqB2bPaymentType.INSTALLMENT) {
        if (!dto.installment) throw new BadRequestException('Installment terms are required');
        const schedule = this.buildInstallmentSchedule(dto.installment, totalAmount);
        await tx.hqB2bInstallmentAgreement.create({
          data: {
            saleId: sale.id,
            status: HqB2bInstallmentStatus.AWAITING_CEO_APPROVAL,
            saleTotal: totalAmount,
            downPayment: dto.installment.downPayment,
            remainingBalance: roundMoney(totalAmount - dto.installment.downPayment),
            installmentStartDate: new Date(dto.installment.installmentStartDate),
            paymentFrequency: dto.installment.paymentFrequency,
            numberOfPayments: dto.installment.numberOfPayments,
            scheduleJson: schedule,
            notes: dto.installment.notes?.trim() ?? null,
          },
        });
        await this.notifyRoles([Role.CEO, Role.OWNER], AlertType.HQ_B2B_SALE_SUBMITTED, sale.id, {
          saleNumber,
          type: 'INSTALLMENT_CEO_REVIEW',
        });
      } else {
        await tx.hqB2bPaymentRequest.create({
          data: {
            saleId: sale.id,
            status: HqB2bPaymentRequestStatus.PENDING,
            expectedAmount: totalAmount,
            submittedById: user.id,
          },
        });
        await this.notifyRoles([Role.HQ_ACCOUNTANT], AlertType.HQ_B2B_SALE_SUBMITTED, sale.id, {
          saleNumber,
          type: 'FULL_PAYMENT',
        });
      }

      await this.auditInTx(tx, user, 'HQ_B2B_SALE_SUBMITTED', sale.id, {
        saleId: sale.id,
        customerId: customer.id,
        customerType: dto.customerType,
        totalAmount,
        paymentType: dto.paymentType,
        status: initialStatus,
      });

      return this.findOne(user, sale.id);
    });
  }

  async approveInstallment(user: AuthUser, saleId: string, dto: ApproveHqB2bInstallmentDto) {
    if (!canApproveHqB2bInstallment(user)) {
      throw new ForbiddenException('Only CEO may approve installment terms');
    }
    const sale = await this.getSaleOrThrow(saleId);
    if (sale.status !== HqB2bSaleStatus.AWAITING_CEO_APPROVAL || !sale.installment) {
      throw new BadRequestException('Sale is not awaiting CEO installment approval');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hqB2bInstallmentAgreement.update({
        where: { saleId },
        data: {
          status: HqB2bInstallmentStatus.AWAITING_DOWN_PAYMENT_CONFIRMATION,
          ceoApprovedById: user.id,
          ceoApprovedAt: new Date(),
        },
      });
      await tx.hqB2bSale.update({
        where: { id: saleId },
        data: { status: HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION },
      });
      await tx.hqB2bPaymentRequest.create({
        data: {
          saleId,
          status: HqB2bPaymentRequestStatus.PENDING,
          expectedAmount: Number(sale.installment!.downPayment),
          submittedById: sale.responsibleUserId,
        },
      });
      await this.auditInTx(tx, user, 'INSTALLMENT_APPROVED_BY_CEO', saleId, {
        saleId,
        comment: dto.comment,
      });
    });

    await this.notifyRoles([Role.HQ_ACCOUNTANT], AlertType.HQ_B2B_INSTALLMENT_CEO_APPROVED, saleId, {
      saleNumber: sale.saleNumber,
    });
    await this.notifyUser(sale.responsibleUserId, AlertType.HQ_B2B_INSTALLMENT_CEO_APPROVED, saleId);

    return this.findOne(user, saleId);
  }

  async rejectInstallment(user: AuthUser, saleId: string, dto: RejectHqB2bInstallmentDto) {
    if (!canApproveHqB2bInstallment(user)) {
      throw new ForbiddenException('Only CEO may reject installment terms');
    }
    const sale = await this.getSaleOrThrow(saleId);
    if (sale.status !== HqB2bSaleStatus.AWAITING_CEO_APPROVAL || !sale.installment) {
      throw new BadRequestException('Sale is not awaiting CEO installment approval');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hqB2bInstallmentAgreement.update({
        where: { saleId },
        data: {
          status: HqB2bInstallmentStatus.CEO_REJECTED,
          ceoRejectedById: user.id,
          ceoRejectedAt: new Date(),
          ceoRejectionReason: dto.reason.trim(),
        },
      });
      await tx.hqB2bSale.update({
        where: { id: saleId },
        data: { status: HqB2bSaleStatus.CEO_REJECTED },
      });
      await this.auditInTx(tx, user, 'INSTALLMENT_REJECTED_BY_CEO', saleId, {
        saleId,
        reason: dto.reason,
      });
    });

    await this.notifyUser(sale.responsibleUserId, AlertType.HQ_B2B_INSTALLMENT_CEO_REJECTED, saleId);
    return this.findOne(user, saleId);
  }

  async listPaymentRequests(user: AuthUser) {
    if (!canConfirmHqB2bPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant may view payment confirmations');
    }
    const rows = await this.prisma.hqB2bPaymentRequest.findMany({
      where: {
        status: {
          in: [
            HqB2bPaymentRequestStatus.PENDING,
            HqB2bPaymentRequestStatus.CORRECTION_REQUESTED,
          ],
        },
      },
      include: {
        sale: {
          include: {
            customer: { select: { fullName: true, companyName: true } },
            responsibleUser: { select: { id: true, fullName: true } },
            installment: { select: { status: true, downPayment: true } },
          },
        },
        submittedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      saleId: row.saleId,
      saleNumber: row.sale.saleNumber,
      createdAt: row.createdAt,
      customerName: row.sale.customerNameSnapshot,
      customerType: row.sale.customerType,
      paymentType: row.sale.paymentType,
      totalAmount: Number(row.sale.totalAmount),
      expectedAmount: Number(row.expectedAmount),
      receivedAmount: row.receivedAmount ? Number(row.receivedAmount) : null,
      status: row.status,
      responsibleName: row.sale.responsibleUser.fullName,
      saleStatus: row.sale.status,
    }));
  }

  async confirmPayment(user: AuthUser, paymentRequestId: string, dto: ConfirmHqB2bPaymentDto) {
    if (!canConfirmHqB2bPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant may confirm payments');
    }
    const request = await this.prisma.hqB2bPaymentRequest.findUnique({
      where: { id: paymentRequestId },
      include: { sale: { include: { installment: true } } },
    });
    if (!request) throw new NotFoundException('Payment request not found');
    if (
      request.status !== HqB2bPaymentRequestStatus.PENDING &&
      request.status !== HqB2bPaymentRequestStatus.CORRECTION_REQUESTED
    ) {
      throw new BadRequestException('Payment request is not pending confirmation');
    }

    const expected = Number(request.expectedAmount);
    const received = roundMoney(dto.receivedAmount);
    if (!amountsEqual(received, expected)) {
      throw new BadRequestException(
        `Received amount ${received} must equal expected amount ${expected}`,
      );
    }

    if (request.sale.paymentType === HqB2bPaymentType.INSTALLMENT) {
      const installment = request.sale.installment;
      if (!installment || installment.status !== HqB2bInstallmentStatus.AWAITING_DOWN_PAYMENT_CONFIRMATION) {
        throw new BadRequestException('Installment down payment is not awaiting confirmation');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hqB2bPaymentRequest.update({
        where: { id: paymentRequestId },
        data: {
          status: HqB2bPaymentRequestStatus.CONFIRMED,
          receivedAmount: received,
          paymentMethod: dto.paymentMethod,
          financeAccountId: dto.financeAccountId ?? null,
          transactionReference: dto.transactionReference?.trim() ?? null,
          receiptDocumentUrl: dto.receiptDocumentUrl?.trim() ?? null,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          comment: dto.comment?.trim() ?? null,
          confirmedById: user.id,
          confirmedAt: new Date(),
        },
      });

      if (request.sale.paymentType === HqB2bPaymentType.FULL_PAYMENT) {
        await tx.hqB2bSale.update({
          where: { id: request.saleId },
          data: {
            status: HqB2bSaleStatus.SENT_TO_WAREHOUSE,
            sentToWarehouseAt: new Date(),
          },
        });
      } else {
        await tx.hqB2bInstallmentAgreement.update({
          where: { saleId: request.saleId },
          data: {
            status: HqB2bInstallmentStatus.ACTIVE,
            paidAmount: received,
            remainingBalance: roundMoney(Number(request.sale.totalAmount) - received),
          },
        });
        await tx.hqB2bSale.update({
          where: { id: request.saleId },
          data: {
            status: HqB2bSaleStatus.SENT_TO_WAREHOUSE,
            sentToWarehouseAt: new Date(),
          },
        });
      }

      await this.auditInTx(tx, user, 'PAYMENT_CONFIRMED_BY_ACCOUNTANT', request.saleId, {
        paymentRequestId,
        receivedAmount: received,
        expectedAmount: expected,
      });
    });

    await this.notifyUser(request.sale.responsibleUserId, AlertType.HQ_B2B_PAYMENT_CONFIRMED, request.saleId);
    await this.notifyRoles([Role.WAREHOUSE_MANAGER], AlertType.HQ_B2B_SALE_WAREHOUSE_READY, request.saleId, {
      saleNumber: request.sale.saleNumber,
    });

    return this.findOne(user, request.saleId);
  }

  async rejectPayment(user: AuthUser, paymentRequestId: string, dto: RejectHqB2bPaymentDto) {
    if (!canConfirmHqB2bPayment(user)) {
      throw new ForbiddenException('Only HQ Accountant may reject payments');
    }
    const request = await this.prisma.hqB2bPaymentRequest.findUnique({
      where: { id: paymentRequestId },
      include: { sale: true },
    });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.status !== HqB2bPaymentRequestStatus.PENDING) {
      throw new BadRequestException('Payment request is not pending');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hqB2bPaymentRequest.update({
        where: { id: paymentRequestId },
        data: {
          status: HqB2bPaymentRequestStatus.REJECTED,
          rejectionReason: dto.reason.trim(),
          comment: dto.comment?.trim() ?? null,
        },
      });
      await tx.hqB2bSale.update({
        where: { id: request.saleId },
        data: { status: HqB2bSaleStatus.PAYMENT_REJECTED },
      });
      await this.auditInTx(tx, user, 'PAYMENT_REJECTED_BY_ACCOUNTANT', request.saleId, {
        paymentRequestId,
        reason: dto.reason,
      });
    });

    await this.notifyUser(request.sale.responsibleUserId, AlertType.HQ_B2B_PAYMENT_REJECTED, request.saleId);
    return this.findOne(user, request.saleId);
  }

  async resubmitPayment(user: AuthUser, saleId: string) {
    this.assertCanManage(user);
    const sale = await this.getSaleOrThrow(saleId);
    if (sale.status !== HqB2bSaleStatus.PAYMENT_REJECTED) {
      throw new BadRequestException('Only rejected payment sales can be resubmitted');
    }
    const expected =
      sale.paymentType === HqB2bPaymentType.INSTALLMENT
        ? Number(sale.installment?.downPayment ?? 0)
        : Number(sale.totalAmount);

    await this.prisma.$transaction(async (tx) => {
      await tx.hqB2bPaymentRequest.create({
        data: {
          saleId,
          status: HqB2bPaymentRequestStatus.PENDING,
          expectedAmount: expected,
          submittedById: user.id,
        },
      });
      await tx.hqB2bSale.update({
        where: { id: saleId },
        data: { status: HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION },
      });
      await this.auditInTx(tx, user, 'PAYMENT_RESUBMITTED', saleId, { saleId });
    });

    await this.notifyRoles([Role.HQ_ACCOUNTANT], AlertType.HQ_B2B_SALE_SUBMITTED, saleId);
    return this.findOne(user, saleId);
  }

  async convertCustomerToFranchise(user: AuthUser, customerId: string, dto: { branchName?: string }) {
    if (!canConvertCustomerToFranchise(user)) {
      throw new ForbiddenException('Only CEO may convert customers to franchise branches');
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { convertedToBranch: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!B2B_CUSTOMER_TYPES.includes(customer.customerType)) {
      throw new BadRequestException('Only Dealer or Distributor customers may be converted');
    }
    if (customer.convertedToBranchId) {
      throw new BadRequestException('Customer is already linked to a franchise branch');
    }

    const branch = await this.branchesService.create(user, {
      name: dto.branchName?.trim() || customer.companyName || customer.fullName,
      city: customer.region ?? undefined,
      address: customer.address ?? undefined,
      phone: customer.phone,
      ownerName: customer.contactPerson ?? customer.fullName,
      branchType: 'FRANCHISE',
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        customerType: CustomerType.FRANCHISE,
        convertedToBranchId: branch.id,
      },
    });

    await this.audit(user, 'CUSTOMER_CONVERTED_TO_FRANCHISE', customerId, {
      customerId,
      branchId: branch.id,
    });

    return { customerId, branchId: branch.id, branchCode: branch.code };
  }

  private async buildSaleItems(
    customerType: B2bCustomerType,
    items: CreateHqB2bSaleDto['items'],
  ) {
    const built = [];
    for (const item of items) {
      if (item.quantity <= 0) throw new BadRequestException('Quantity must be positive');
      const available = await this.resolveHqAvailableQuantity(item.productId);
      if (item.quantity > available) {
        throw new BadRequestException(`Insufficient HQ stock for product ${item.productId}`);
      }
      const pricing = await this.pricing.resolveSellingPrice(item.productId, customerType);
      if (!pricing.priceConfigured) {
        throw new BadRequestException(`Price not configured for product ${item.productId}`);
      }
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, deletedAt: null },
        include: { productCategory: { select: { nameRu: true, nameEn: true } } },
      });
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
      const unitPrice = pricing.finalSellingPrice;
      const lineTotal = roundMoney(unitPrice * item.quantity);
      built.push({
        productId: item.productId,
        productName: product.name,
        sku: product.sku,
        categoryName:
          product.productCategory?.nameRu ?? product.productCategory?.nameEn ?? product.category,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        costPrice: pricing.costPrice,
        basePrice: pricing.basePrice,
        pricingPolicyVersionId: pricing.pricingPolicyVersionId,
        priceProfileId: pricing.priceProfileId,
        pricingSource: pricing.pricingSource,
        appliedRuleType: pricing.appliedRuleType,
        appliedRuleId: pricing.appliedRuleId,
      });
    }
    return built;
  }

  private buildInstallmentSchedule(
    installment: NonNullable<CreateHqB2bSaleDto['installment']>,
    saleTotal: number,
  ) {
    const remaining = roundMoney(saleTotal - installment.downPayment);
    const perPayment = roundMoney(remaining / installment.numberOfPayments);
    const start = new Date(installment.installmentStartDate);
    const schedule: Array<{ dueDate: string; amount: number }> = [];
    for (let i = 0; i < installment.numberOfPayments; i += 1) {
      const due = new Date(start);
      if (installment.paymentFrequency === 'MONTHLY') {
        due.setMonth(due.getMonth() + i);
      } else if (installment.paymentFrequency === 'WEEKLY') {
        due.setDate(due.getDate() + i * 7);
      } else {
        due.setMonth(due.getMonth() + i);
      }
      schedule.push({ dueDate: due.toISOString(), amount: perPayment });
    }
    return schedule;
  }

  private async resolveHqAvailableQuantity(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, sku: true },
    });
    if (!product) return 0;
    const ids = new Set<string>([product.id]);
    const sku = product.sku?.trim();
    if (sku) {
      const siblings = await this.prisma.product.findMany({
        where: { sku, deletedAt: null },
        select: { id: true },
      });
      for (const row of siblings) ids.add(row.id);
    }
    const balance = await this.prisma.inventoryBalance.aggregate({
      where: {
        productId: { in: [...ids] },
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      },
      _sum: { quantity: true },
    });
    return Math.max(0, Number(balance._sum.quantity ?? 0));
  }

  private async generateSaleNumber(tx: PrismaTx) {
    const prefix = `HB2B-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const count = await tx.hqB2bSale.count({
      where: { saleNumber: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private derivePaymentStatus(
    sale: {
      paymentRequests: Array<{ status: HqB2bPaymentRequestStatus }>;
      installment: { status: HqB2bInstallmentStatus } | null;
      status: HqB2bSaleStatus;
    },
  ) {
    if (sale.status === HqB2bSaleStatus.SENT_TO_WAREHOUSE || sale.status === HqB2bSaleStatus.COMPLETED) {
      return 'CONFIRMED';
    }
    if (sale.status === HqB2bSaleStatus.PAYMENT_REJECTED) return 'REJECTED';
    const pending = sale.paymentRequests.find((r) => r.status === HqB2bPaymentRequestStatus.PENDING);
    if (pending) return 'PENDING';
    return sale.installment?.status ?? 'PENDING';
  }

  private async getSaleOrThrow(id: string) {
    const sale = await this.prisma.hqB2bSale.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        responsibleUser: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        paymentRequests: { orderBy: { createdAt: 'desc' } },
        installment: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  private assertCanManage(user: AuthUser) {
    if (!canManageHqB2bSales(user)) {
      throw new ForbiddenException('HQ Sales access required');
    }
  }

  private assertCanView(user: AuthUser) {
    if (!canViewHqB2bSales(user)) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async audit(
    user: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'HqB2bSale',
        entityId,
        metadata: { ...metadata, userId: user.id, timestamp: new Date().toISOString() },
      },
    });
  }

  private async auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'HqB2bSale',
        entityId,
        metadata: { ...metadata, userId: user.id, timestamp: new Date().toISOString() },
      },
    });
  }

  private async notifyRoles(
    roles: Role[],
    type: AlertType,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.notifications.notify(null, {
      type,
      entityType: 'HqB2bSale',
      entityId,
      recipientRoles: roles,
      referenceNumber: metadata?.saleNumber as string | undefined,
      message: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  private async notifyUser(userId: string, type: AlertType, entityId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return;
    await this.notifications.notify(null, {
      type,
      entityType: 'HqB2bSale',
      entityId,
      recipientRoles: [user.role],
    });
  }
}
