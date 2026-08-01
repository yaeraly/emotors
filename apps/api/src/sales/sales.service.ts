import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertType,
  CustomerEventType,
  CustomerLoyaltyCategory,
  CustomerStatus,
  CustomerType,
  InstallmentStatus,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentStatus,
  PricingEnginePriceType,
  Prisma,
  Role,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import {
  calculateFinalSaleUnitPrice,
  getLoyaltyDiscountPercent,
} from '../customers/customer-loyalty.util';
import { LoyaltyProgramSettingsService } from '../customers/loyalty-program-settings.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingCatalogService } from '../pricing/pricing-catalog.service';
import { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { PricingService } from '../pricing/pricing.service';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { PrismaService } from '../prisma/prisma.service';
import { assertBranchCashierCannotManageSales, assertBranchSalesManagerCannotApproveSale, hasAnyFullAccessRole, hasAnyHqRole, isBranchSalesManagerUser, resolveUserRoles, shouldStripSaleFinancialFields, shouldStripSaleWorkflowStatus } from '../rbac/rbac';
import { CASHIER_ASSIGNMENT_OPERATIONS } from '../rbac/cashier-capability.util';
import { assertCashierPaymentAllowed } from '../finance/finance-assignment.util';
import { activeBranchWarehouseWhere } from '../warehouse/warehouse.util';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SaleCustomerSearchQueryDto, SaleProductSearchQueryDto } from './dto/sale-search-query.dto';
import {
  assertBranchSaleCustomerTypeAllowed,
  assertSalePricingChannelMatchesCustomer,
  minimumPriceTypeForChannel,
  missingSalePricingPolicyMessage,
  recommendedPriceTypeForChannel,
  resolvePricingChannelFromCustomerType,
  type SalePricingChannel,
} from './sale-customer-pricing.util';
import { assertBranchSalesManagerCanCancelSale } from './branch-sales-workflow.util';
import { SaleInstallmentApprovalService } from './sale-installment-approval.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly commissionsService: CommissionsService,
    private readonly pricingService: PricingService,
    private readonly pricingCatalogService: PricingCatalogService,
    private readonly pricingResolution: PricingResolutionService,
    private readonly saleInstallmentApprovalService: SaleInstallmentApprovalService,
    private readonly notificationsService: NotificationsService,
    private readonly loyaltyProgramSettingsService: LoyaltyProgramSettingsService,
  ) {}

  create(user: AuthUser, dto: CreateSaleDto) {
    return this.createDraft(user, dto);
  }

  async createDraft(user: AuthUser, dto: CreateSaleDto) {
    assertBranchCashierCannotManageSales(user);
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.getCustomerForSale(tx, user, dto.customerId);
      this.applyCustomerPricingChannels(customer, dto);
      this.assertCustomerAllowedForBranchSale(customer, dto.items);
      await this.enrichSaleItemsFromProducts(user, customer.branchId, dto);
      await this.applyAutomaticSalePricing(user, customer, dto);
      await this.validateSaleStock(user, customer.branchId, dto.items);
      await this.assertSaleItemsResolvablePricing(user, customer.branchId, dto.items);
      await this.pricingService.validateSaleItems(user, customer.branchId, dto.items, {
        automaticCustomerPricing: true,
      });
      const saleDate = dto.saleDate ?? new Date();
      const receiptNumber = await this.generateReceiptNumber(tx, saleDate);
      const totals = await this.calculateSaleWithFreeze(user, customer.branchId, dto);
      const draftReceiptText = this.buildReceiptText({
        receiptNumber,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        sellerName: user.fullName,
        saleDate,
        items: dto.items,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        debtAmount: totals.totalAmount,
        paymentStatus: PaymentStatus.DEBT,
        receiptStatus: 'DRAFT',
      });

      const sale = await tx.sale.create({
        data: {
          branchId: customer.branchId,
          customerId: customer.id,
          sellerId: user.id,
          pricingPolicyVersionId: totals.pricingPolicyVersionId,
          receiptNumber,
          saleDate,
          totalAmount: totals.totalAmount,
          totalCost: totals.totalCost,
          profitAmount: totals.profitAmount,
          paidAmount: 0,
          debtAmount: totals.totalAmount,
          paymentStatus: PaymentStatus.DEBT,
          status: SaleStatus.DRAFT,
          draftReceiptText,
          notes: dto.notes,
          items: { create: totals.items },
          installments: this.buildInstallmentCreate(
            dto,
            customer.branchId,
            customer.id,
            totals.totalAmount,
            saleDate,
          ),
          receipt: {
            create: {
              branchId: customer.branchId,
              receiptNumber,
              qrCodeData: draftReceiptText,
            },
          },
        },
        include: this.saleInclude(),
      });

      if (dto.paymentType === 'INSTALLMENT') {
        await this.saleInstallmentApprovalService.syncInstallmentDraftFromSale(
          tx,
          user,
          sale,
          dto,
          totals.totalAmount,
        );
      }

      const withApproval = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: this.saleInclude(),
      });

      return this.toSaleResponse(withApproval);
    }).then(async (sale) => {
      if (sale.installments?.length) {
        await this.audit(user, sale.branchId, 'INSTALLMENT_CREATED', 'Sale', sale.id);
      }
      await this.audit(user, sale.branchId, 'BRANCH_SALE_DRAFT_SAVED', 'Sale', sale.id, {
        paymentType: dto.paymentType ?? 'FULL_PAYMENT',
        status: sale.status,
      });
      return sale;
    });
  }

  async listInstallments(user: AuthUser, scope?: 'active' | 'closed') {
    const simplified = await this.saleInstallmentApprovalService.listBranchInstallments(
      user,
      scope === 'closed' ? 'closed' : 'active',
    );
    if (simplified.length > 0 || scope) {
      return simplified;
    }

    const where: Prisma.InstallmentScheduleWhereInput = {
      ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
    };

    const installments = await this.prisma.installmentSchedule.findMany({
      where,
      include: {
        customer: {
          select: { id: true, fullName: true, phone: true },
        },
        sale: {
          select: { id: true, receiptNumber: true, saleDate: true },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });

    return installments.map((installment) => ({
      ...installment,
      amount: Number(installment.amount),
      paidAmount: Number(installment.paidAmount),
    }));
  }

  async searchCustomerOptions(user: AuthUser, query: SaleCustomerSearchQueryDto) {
    if (!user.branchId && !this.canAccessAllBranches(user)) {
      throw new ForbiddenException('You can only access your own branch');
    }

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...this.buildBranchWhere(user),
    };

    if (query.includeArchived) {
      where.status = { not: CustomerStatus.INACTIVE };
    } else {
      where.status = { notIn: [CustomerStatus.ARCHIVED, CustomerStatus.INACTIVE] };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const terms = search.split(/\s+/).filter(Boolean);
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { whatsappPhone: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        ...terms.map((term) => ({
          fullName: { contains: term, mode: 'insensitive' as const },
        })),
      ];
    }

    where.customerType = {
      notIn: [CustomerType.DEALER, CustomerType.DISTRIBUTOR],
    };

    if (query.customerType) {
      where.customerType = query.customerType;
    } else if (user.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: user.branchId, deletedAt: null },
        select: { branchType: true, code: true },
      });
      const isHqBranch =
        branch?.branchType === 'HQ_BRANCH' || branch?.code === HQ_CATALOG_BRANCH_CODE;
      if (isHqBranch) {
        where.customerType = { in: [CustomerType.RETAIL, CustomerType.WHOLESALE] };
      }
    }

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsappPhone: true,
        status: true,
        customerType: true,
        totalDebtAmount: true,
        sales: {
          where: { deletedAt: null, status: SaleStatus.FINALIZED },
          select: { saleDate: true },
          orderBy: { saleDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const customerIds = customers.map((customer) => customer.id);
    const overdueInstallments = customerIds.length
      ? await this.prisma.installmentSchedule.findMany({
          where: {
            customerId: { in: customerIds },
            ...this.buildBranchWhere(user),
            OR: [
              { status: InstallmentStatus.OVERDUE },
              {
                status: { in: [InstallmentStatus.PENDING, InstallmentStatus.PARTIAL] },
                dueDate: { lt: new Date() },
              },
            ],
          },
          select: { customerId: true },
        })
      : [];
    const overdueCustomerIds = new Set(overdueInstallments.map((row) => row.customerId));

    return customers.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone,
      status: customer.status,
      customerType: customer.customerType,
      lastPurchaseDate: customer.sales[0]?.saleDate ?? null,
      totalDebtAmount: Number(customer.totalDebtAmount),
      hasOverdueInstallment: overdueCustomerIds.has(customer.id),
    }));
  }

  async searchProductOptions(user: AuthUser, query: SaleProductSearchQueryDto) {
    const branchWhere = this.buildBranchWhere(user);
    const branchId =
      'branchId' in branchWhere && branchWhere.branchId
        ? branchWhere.branchId
        : user.branchId;

    if (!branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) {
      return [];
    }

    const search = query.search?.trim();
    const productFilter: Prisma.ProductWhereInput = {
      branchId,
      deletedAt: null,
      isActive: true,
      warehouseId: warehouse.id,
    };

    if (search) {
      productFilter.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { productCategory: { code: { contains: search, mode: 'insensitive' } } },
        { productCategory: { nameRu: { contains: search, mode: 'insensitive' } } },
        { productCategory: { nameKy: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        warehouseId: warehouse.id,
        branchId,
        product: productFilter,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            category: true,
            sellingPriceKgs: true,
            recommendedRetailPriceKgs: true,
            minimumSellingPriceKgs: true,
            maximumDiscountPercent: true,
            enableMaximumRetailPrice: true,
            productCategory: { select: { code: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
      take: 40,
    });

    const productOptions = await Promise.all(
      balances.map(async (balance) => {
        const availableQty = Math.max(balance.quantity - (balance.reservedQuantity ?? 0), 0);
        const pricingChannel = (query.pricingChannel ?? 'RETAIL') as SalePricingChannel;
        const recommendedPriceKgs = await this.resolveRecommendedChannelPrice(
          branchId,
          balance.product.id,
          pricingChannel,
        );
        const minimumPriceKgs = await this.resolveChannelMinimumPrice(
          branchId,
          balance.product.id,
          pricingChannel,
        );
        const maximumPriceKgs =
          pricingChannel === 'WHOLESALE'
            ? await this.resolveWholesaleMaximumPrice(branchId, balance.product.id)
            : pricingChannel === 'MASTER'
              ? null
              : await this.resolveRetailMaximumPrice(branchId, balance.product.id);
        const sellingPriceKgs = recommendedPriceKgs ?? 0;

        return {
          id: balance.product.id,
          name: balance.product.name,
          sku: balance.product.sku,
          unit: balance.product.unit,
          category: balance.product.category,
          productCode: balance.product.productCategory?.code ?? null,
          availableQty,
          sellingPriceKgs,
          pricingChannel,
          recommendedRetailPriceKgs: recommendedPriceKgs,
          hasRecommendedPrice: recommendedPriceKgs !== null,
          minimumRetailPriceKgs: minimumPriceKgs,
          maximumRetailPriceKgs: maximumPriceKgs,
          hasMaximumRetailPrice: maximumPriceKgs !== null,
          minimumSellingPriceKgs:
            minimumPriceKgs ??
            Number(balance.product.minimumSellingPriceKgs || 0),
          maximumDiscountPercent: Number(balance.product.maximumDiscountPercent || 0),
          enableMaximumRetailPrice: Boolean(balance.product.enableMaximumRetailPrice),
        };
      }),
    );

    return productOptions
      .filter((product) => product.availableQty > 0)
      .slice(0, 20);
  }

  private async resolveRecommendedRetailPrice(branchId: string, productId: string) {
    return this.resolveRecommendedChannelPrice(branchId, productId, 'RETAIL');
  }

  private async resolveRecommendedChannelPrice(
    branchId: string,
    productId: string,
    channel: SalePricingChannel,
  ) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: recommendedPriceTypeForChannel(channel),
      });
      const price = roundDisplayMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveChannelMinimumPrice(
    branchId: string,
    productId: string,
    channel: SalePricingChannel,
  ) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: minimumPriceTypeForChannel(channel),
      });
      const price = roundDisplayMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveRetailMinimumPrice(branchId: string, productId: string) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: PricingEnginePriceType.RETAIL_MINIMUM,
      });
      const price = this.roundMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveRetailMaximumPrice(branchId: string, productId: string) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: PricingEnginePriceType.RETAIL_MAXIMUM,
      });
      const price = this.roundMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveWholesaleMinimumPrice(branchId: string, productId: string) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: PricingEnginePriceType.WHOLESALE_MINIMUM,
      });
      const price = this.roundMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveRecommendedWholesalePrice(branchId: string, productId: string) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: PricingEnginePriceType.WHOLESALE_RECOMMENDED,
      });
      const price = this.roundMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  private async resolveWholesaleMaximumPrice(branchId: string, productId: string) {
    try {
      const freeze = await this.pricingResolution.resolveWithFreeze(branchId, productId, {
        priceType: PricingEnginePriceType.WHOLESALE_MAXIMUM,
      });
      const price = this.roundMoney(Number(freeze.resolvedPriceKgs ?? 0));
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  async updateDraft(user: AuthUser, id: string, dto: CreateSaleDto) {
    assertBranchCashierCannotManageSales(user);
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (
        sale.status !== SaleStatus.DRAFT &&
        sale.status !== SaleStatus.SENT_TO_CUSTOMER
      ) {
        throw new BadRequestException('Cannot edit finalized or approved sale');
      }

      const customer = await this.getCustomerForSale(tx, user, dto.customerId);
      this.applyCustomerPricingChannels(customer, dto);
      this.assertCustomerAllowedForBranchSale(customer, dto.items);
      await this.enrichSaleItemsFromProducts(user, customer.branchId, dto);
      await this.applyAutomaticSalePricing(user, customer, dto);
      await this.validateSaleStock(user, customer.branchId, dto.items);
      await this.assertSaleItemsResolvablePricing(user, customer.branchId, dto.items);
      await this.pricingService.validateSaleItems(user, customer.branchId, dto.items, {
        automaticCustomerPricing: true,
      });
      const saleDate = dto.saleDate ?? sale.saleDate;
      const totals = await this.calculateSaleWithFreeze(user, customer.branchId, dto);
      const paymentAggregate = await tx.payment.aggregate({
        where: { saleId: sale.id, status: PaymentRecordStatus.ACTIVE },
        _sum: { amount: true },
      });
      const paidAmount = this.roundMoney(
        Number(paymentAggregate._sum.amount ?? 0),
      );
      const debtAmount = this.roundMoney(
        Math.max(totals.totalAmount - paidAmount, 0),
      );
      const paymentStatus = this.getPaymentStatus(totals.totalAmount, paidAmount);
      const activePayments = await tx.payment.findMany({
        where: { saleId: sale.id, status: PaymentRecordStatus.ACTIVE },
        select: {
          method: true,
          amount: true,
          cashReceived: true,
          changeAmount: true,
          status: true,
        },
      });
      const draftReceiptText = this.buildReceiptText({
        receiptNumber: sale.receiptNumber,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        sellerName: user.fullName,
        saleDate,
        items: dto.items,
        totalAmount: totals.totalAmount,
        paidAmount,
        debtAmount,
        paymentStatus,
        receiptStatus: 'DRAFT',
        payments: activePayments,
      });

      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
      await tx.installmentSchedule.deleteMany({ where: { saleId: sale.id } });

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          customerId: customer.id,
          branchId: customer.branchId,
          pricingPolicyVersionId: totals.pricingPolicyVersionId,
          saleDate,
          totalAmount: totals.totalAmount,
          totalCost: totals.totalCost,
          profitAmount: totals.profitAmount,
          paidAmount,
          debtAmount,
          paymentStatus,
          draftReceiptText,
          notes: dto.notes,
          items: { create: totals.items },
          installments: this.buildInstallmentCreate(
            dto,
            customer.branchId,
            customer.id,
            debtAmount,
            saleDate,
          ),
          receipt: {
            update: {
              branchId: customer.branchId,
              qrCodeData: draftReceiptText,
            },
          },
        },
        include: this.saleInclude(),
      });

      await this.refreshInstallments(tx, sale.id, paidAmount);
      const saleForInvalidation = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          items: { select: { productId: true, quantity: true, unitPrice: true } },
          installments: { orderBy: { dueDate: 'asc' } },
          installmentApproval: true,
          customer: { select: { fullName: true } },
          seller: { select: { fullName: true } },
        },
      });
      await this.saleInstallmentApprovalService.invalidateApprovalIfTermsChanged(
        tx,
        user,
        saleForInvalidation as any,
      );

      if (dto.paymentType === 'INSTALLMENT') {
        await this.saleInstallmentApprovalService.syncInstallmentDraftFromSale(
          tx,
          user,
          { id: sale.id, branchId: customer.branchId },
          dto,
          totals.totalAmount,
        );
      }

      const refreshed = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: this.saleInclude(),
      });
      return this.toSaleResponse(refreshed);
    }).then(async (sale) => {
      await this.audit(user, sale.branchId, 'BRANCH_SALE_DRAFT_SAVED', 'Sale', sale.id, {
        paymentType: dto.paymentType ?? 'FULL_PAYMENT',
        status: sale.status,
      });
      return sale;
    });
  }

  async findAll(user: AuthUser, query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      ...this.buildBranchWhere(user, query.branchId),
    };

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.from || query.to) {
      where.saleDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { receiptNumber: { contains: search, mode: 'insensitive' } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            whatsappPhone: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        branch: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    return sales.map((sale) => this.sanitizeSaleForUser(user, this.toSaleResponse(sale)));
  }

  async findOne(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);
    return this.sanitizeSaleForUser(user, this.toSaleResponse(sale));
  }

  async sendWhatsApp(user: AuthUser, id: string) {
    assertBranchCashierCannotManageSales(user);
    const sale = await this.getAccessibleSale(user, id);

    if (sale.status === SaleStatus.FINALIZED || sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Cannot send finalized or cancelled sale');
    }

    const message = sale.draftReceiptText ?? sale.receipt?.qrCodeData ?? '';
    const phone = (sale.customer.whatsappPhone || sale.customer.phone).replace(
      /\D/g,
      '',
    );
    const whatsappMessageText = `Саламатсызбы! EMOTORS сатуу чеги:\n\n${message}`;
    const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(
      whatsappMessageText,
    )}`;

    const updated = await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.SENT_TO_CUSTOMER,
        whatsappMessageText,
        sentToCustomerAt: new Date(),
      },
      include: this.saleInclude(),
    });

    return {
      sale: this.toSaleResponse(updated),
      whatsappLink,
      whatsappMessageText,
    };
  }

  async approve(user: AuthUser, id: string) {
    assertBranchCashierCannotManageSales(user);
    assertBranchSalesManagerCannotApproveSale(user);
    const sale = await this.getAccessibleSale(user, id);

    if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.FINALIZED) {
      throw new BadRequestException('Cannot approve this sale');
    }

    const updated = await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.APPROVED_BY_CUSTOMER,
        approvedAt: new Date(),
      },
      include: this.saleInclude(),
    });

    return this.toSaleResponse(updated);
  }

  async addPayment(user: AuthUser, id: string, dto: AddPaymentDto) {
    const assignment = await assertCashierPaymentAllowed(this.prisma, user, {
      accountId: dto.financeAccountId,
      operation: CASHIER_ASSIGNMENT_OPERATIONS.RECEIVE_PAYMENTS,
    });

    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);
      const selfProcessed = sale.sellerId === user.id;

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Cannot add payment to cancelled sale');
      }

      const saleRecord = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        select: { totalAmount: true },
      });
      const saleTotal = Number(saleRecord.totalAmount);

      let amount = this.roundMoney(dto.amount);
      let cashReceived =
        dto.cashReceived != null ? this.roundMoney(dto.cashReceived) : null;
      let changeAmount =
        dto.changeAmount != null ? this.roundMoney(dto.changeAmount) : null;

      const existingPayments = await tx.payment.findMany({
        where: {
          saleId: sale.id,
          branchId: sale.branchId,
          status: PaymentRecordStatus.ACTIVE,
        },
        select: { amount: true, method: true },
      });

      const existingNonCashTotal = this.roundMoney(
        existingPayments
          .filter((payment) => payment.method !== PaymentMethod.CASH)
          .reduce((sum, payment) => sum + Number(payment.amount), 0),
      );
      const existingCashApplied = this.roundMoney(
        existingPayments
          .filter((payment) => payment.method === PaymentMethod.CASH)
          .reduce((sum, payment) => sum + Number(payment.amount), 0),
      );

      if (dto.method === PaymentMethod.CASH) {
        const received = cashReceived ?? amount;
        if (received == null || received < 0) {
          throw new BadRequestException('Введите полученную сумму');
        }
        const cashRequired = this.roundMoney(
          Math.max(saleTotal - existingNonCashTotal, 0),
        );
        amount = this.roundMoney(Math.min(received, cashRequired));
        changeAmount = this.roundMoney(Math.max(received - cashRequired, 0));
        cashReceived = received;
      } else {
        const projectedNonCash = this.roundMoney(existingNonCashTotal + amount);
        if (projectedNonCash > saleTotal - existingCashApplied + 0.009) {
          throw new BadRequestException(
            'Сумма безналичной оплаты превышает остаток к оплате',
          );
        }
        if (amount <= 0) {
          throw new BadRequestException('Payment amount must be greater than 0');
        }
      }

      if (amount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }

      if (
        dto.method === PaymentMethod.CASH &&
        cashReceived != null &&
        cashReceived + 0.009 < amount
      ) {
        throw new BadRequestException('Полученная сумма наличными меньше суммы оплаты');
      }

      const existingActivePayments = existingPayments.length;

      const payment = await tx.payment.create({
        data: {
          branchId: sale.branchId,
          saleId: sale.id,
          customerId: sale.customerId,
          amount,
          method: dto.method,
          cashReceived: dto.method === PaymentMethod.CASH ? cashReceived : null,
          changeAmount: dto.method === PaymentMethod.CASH ? changeAmount : null,
          paidAt: dto.paidAt ?? new Date(),
          note: dto.note,
          createdById: user.id,
          financeAccountId: dto.financeAccountId ?? assignment.accountId,
          selfProcessed,
        },
      });

      if (existingActivePayments > 0) {
        await this.auditInTx(tx, user, sale.branchId, 'MIXED_PAYMENT_CREATED', 'Sale', sale.id, {
          saleId: sale.id,
          paymentId: payment.id,
          method: dto.method,
          amount,
        });
      }

      await this.auditInTx(tx, user, sale.branchId, 'PAYMENT_PART_CREATED', 'Payment', payment.id, {
        saleId: sale.id,
        method: dto.method,
        amount,
        cashReceived,
        changeAmount,
        financeAccountId: payment.financeAccountId,
        selfProcessed,
        saleCreatedBy: sale.sellerId,
        paymentAcceptedBy: user.id,
      });

      await this.refreshSalePaymentState(tx, sale.id);

      if (sale.status === SaleStatus.FINALIZED) {
        await this.refreshCustomerFinancials(tx, sale.customerId, {
          userId: user.id,
          role: user.role,
          branchId: sale.branchId,
        });
      }
    });

    return this.findOne(user, id);
  }

  async voidPayment(user: AuthUser, id: string, paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);
      const payment = await tx.payment.findFirst({
        where: {
          id: paymentId,
          saleId: sale.id,
          branchId: sale.branchId,
          status: PaymentRecordStatus.ACTIVE,
        },
      });
      if (!payment) throw new NotFoundException('Payment not found');

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.VOID,
          voidedAt: new Date(),
        },
      });
      await this.refreshSalePaymentState(tx, sale.id);
      await this.auditInTx(tx, user, sale.branchId, 'PAYMENT_VOID', 'Payment', payment.id);
    });

    return this.findOne(user, id);
  }

  async finalize(user: AuthUser, id: string) {
    assertBranchCashierCannotManageSales(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
        },
        include: {
          items: true,
          installments: { orderBy: { dueDate: 'asc' } },
          installmentApproval: true,
          customer: true,
          seller: true,
        },
      });

      if (!sale) {
        throw new NotFoundException('Sale not found');
      }

      if (sale.status === SaleStatus.FINALIZED || sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Sale is already completed or cancelled');
      }

      await this.refreshSalePaymentState(tx, sale.id);
      const refreshedSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          items: true,
          installments: { orderBy: { dueDate: 'asc' } },
          installmentApproval: true,
          customer: true,
          seller: true,
        },
      });

      const requiresInstallmentApproval =
        this.saleInstallmentApprovalService.saleRequiresInstallmentApproval(refreshedSale);
      const isFullPayment =
        this.saleInstallmentApprovalService.saleIsFullPayment(refreshedSale);

      if (requiresInstallmentApproval) {
        await this.saleInstallmentApprovalService.assertCanFinalizeInstallmentSale(
          tx,
          refreshedSale as any,
        );
      } else if (!isFullPayment) {
        throw new BadRequestException('Укажите условия рассрочки или полную оплату');
      } else {
        if (Number(refreshedSale.debtAmount) > 0.009) {
          throw new BadRequestException(
            'Для полной оплаты сумма платежа должна покрывать стоимость продажи',
          );
        }
        if (Number(refreshedSale.paidAmount) + 0.009 < Number(refreshedSale.totalAmount)) {
          throw new BadRequestException('Недостаточная сумма оплаты для завершения продажи');
        }

        const finalizeItems = refreshedSale.items.map((item) => ({
          productId: item.productId ?? undefined,
          productName: item.productName,
          productSku: item.productSku ?? undefined,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          unitCost: Number(item.unitCost),
          priceAboveRecommendedReasonCode: item.priceAboveRecommendedReasonCode ?? undefined,
          priceAboveRecommendedComment: item.priceAboveRecommendedComment ?? undefined,
          pricingChannel: this.resolvePricingChannelFromCustomer(refreshedSale.customer.customerType),
        }));

        await this.validateSaleStock(user, refreshedSale.branchId, finalizeItems);
        await this.assertSaleItemsResolvablePricing(user, refreshedSale.branchId, finalizeItems);
        await this.pricingService.validateSaleItems(user, refreshedSale.branchId, finalizeItems, {
          automaticCustomerPricing: true,
        });
      }

      const refreshed = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { payments: true, customer: true, seller: true, items: true },
      });
      const finalReceiptText = this.buildReceiptText({
        receiptNumber: refreshed.receiptNumber,
        customerName: refreshed.customer.fullName,
        customerPhone: refreshed.customer.phone,
        sellerName: refreshed.seller.fullName,
        saleDate: refreshed.saleDate,
        items: refreshed.items,
        totalAmount: Number(refreshed.totalAmount),
        paidAmount: Number(refreshed.paidAmount),
        debtAmount: Number(refreshed.debtAmount),
        paymentStatus: refreshed.paymentStatus,
        receiptStatus: 'FINAL',
        payments: refreshed.payments,
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.FINALIZED,
          finalizedAt: new Date(),
          receipt: {
            update: {
              qrCodeData: finalReceiptText,
            },
          },
        },
      });

      await tx.customerEvent.create({
        data: {
          customerId: sale.customerId,
          branchId: sale.branchId,
          type: CustomerEventType.SALE,
          message: `Finalized sale ${sale.receiptNumber}: ${Number(
            sale.totalAmount,
          ).toFixed(2)} KGS`,
          createdById: user.id,
        },
      });

      await this.pricingCatalogService.applyFifoCostsOnFinalize(
        tx,
        user,
        { id: sale.id, branchId: sale.branchId, items: refreshed.items },
        (productId) => this.getProductWarehouseId(tx, productId),
      );

      for (const item of refreshed.items) {
        if (!item.productId) {
          continue;
        }

        const latestItem = await tx.saleItem.findUniqueOrThrow({ where: { id: item.id } });

        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: item.productId,
          warehouseId: await this.getProductWarehouseId(tx, item.productId),
          type: StockMovementType.SALE,
          quantity: item.quantity,
          unitCostKgs: Number(latestItem.unitCost),
          referenceType: 'SALE',
          referenceId: sale.id,
          note: `Sale ${sale.receiptNumber}`,
        });
      }

      await this.refreshCustomerFinancials(tx, sale.customerId, {
        userId: user.id,
        role: user.role,
        branchId: sale.branchId,
      });
      await this.commissionsService.createSalesCommission(tx, sale.id);

      if (requiresInstallmentApproval) {
        await this.saleInstallmentApprovalService.activateOnSaleFinalize(tx, user, sale.id);
      }
    });

    const finalized = await this.findOne(user, id);
    const isFullPayment = this.saleInstallmentApprovalService.saleIsFullPayment(finalized);
    await this.audit(user, finalized.branchId, 'SALE_FINALIZED', 'Sale', id, {
      paymentStatus: finalized.paymentStatus,
      totalAmount: finalized.totalAmount,
      paidAmount: finalized.paidAmount,
      isFullPayment,
    });
    return finalized;
  }

  async cancel(user: AuthUser, id: string) {
    assertBranchCashierCannotManageSales(user);
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Sale is already cancelled');
      }

      assertBranchSalesManagerCanCancelSale(user, {
        status: sale.status,
        paidAmount: Number(sale.paidAmount),
        paymentStatus: sale.paymentStatus,
      });

      if (sale.status === SaleStatus.FINALIZED && !this.hasFullAccess(user)) {
        throw new ForbiddenException('Only HQ can cancel finalized sale');
      }

      const previousStatus = sale.status;
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      if (sale.status === SaleStatus.FINALIZED) {
        await this.refreshCustomerFinancials(tx, sale.customerId, {
          userId: user.id,
          role: user.role,
          branchId: sale.branchId,
        });
      }
      await this.auditInTx(tx, user, sale.branchId, 'BRANCH_SALE_CANCELLED', 'Sale', sale.id, {
        previousStatus,
        newStatus: SaleStatus.CANCELLED,
        paymentStatus: sale.paymentStatus,
      });
    });

    return this.findOne(user, id);
  }

  async receipt(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);
    const receiptStatus =
      sale.status === SaleStatus.FINALIZED ? 'FINAL' : 'DRAFT';

    return {
      ...this.toSaleResponse(sale),
      receiptStatus,
      receiptText:
        receiptStatus === 'FINAL'
          ? sale.receipt?.qrCodeData
          : sale.draftReceiptText ?? sale.receipt?.qrCodeData,
      qrCodeData: sale.receipt?.qrCodeData,
      printedAt: sale.receipt?.printedAt,
    };
  }

  async dailyReport(user: AuthUser, query: SaleQueryDto) {
    const now = new Date();
    const from =
      query.from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to =
      query.to ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const branchWhere = this.buildBranchWhere(user, query.branchId);

    const [sales, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          deletedAt: null,
          status: SaleStatus.FINALIZED,
          ...branchWhere,
          saleDate: { gte: from, lte: to },
        },
        select: {
          totalAmount: true,
          paidAmount: true,
          debtAmount: true,
          profitAmount: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          ...branchWhere,
          sale: { status: SaleStatus.FINALIZED },
          paidAt: { gte: from, lte: to },
        },
        select: {
          amount: true,
          method: true,
        },
      }),
    ]);

    return {
      totalSalesAmount: this.sumDecimals(sales.map((sale) => sale.totalAmount)),
      totalPaidAmount: this.sumDecimals(sales.map((sale) => sale.paidAmount)),
      totalDebtAmount: this.sumDecimals(sales.map((sale) => sale.debtAmount)),
      ...(shouldStripSaleFinancialFields(user)
        ? {}
        : {
            totalProfitAmount: this.sumDecimals(
              sales.map((sale) => sale.profitAmount),
            ),
          }),
      saleCount: sales.length,
      cashPayments: this.sumPayments(payments, [PaymentMethod.CASH]),
      transferPayments: this.sumPayments(payments, [
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.QR,
        PaymentMethod.MBANK,
        PaymentMethod.ELCART,
      ]),
      cardPayments: this.sumPayments(payments, [PaymentMethod.CARD]),
    };
  }

  private async calculateSaleWithFreeze(user: AuthUser, branchId: string, dto: CreateSaleDto) {
    const items = [];
    let pricingPolicyVersionId: string | null = null;

    for (const item of dto.items) {
      const totalPrice = this.roundMoney(item.quantity * item.unitPrice);
      const totalCost = this.roundMoney(item.quantity * item.unitCost);
      const profitAmount = this.roundMoney(totalPrice - totalCost);

      let freezeFields: Record<string, unknown> = {};
      if (item.productId) {
        try {
          const channel = (item.pricingChannel ?? 'RETAIL') as SalePricingChannel;
          const freeze = await this.pricingResolution.resolveWithFreeze(branchId, item.productId, {
            priceType: recommendedPriceTypeForChannel(channel),
            auditUser: user,
            auditEntity: 'SaleItem',
          });
          pricingPolicyVersionId = pricingPolicyVersionId ?? freeze.pricingPolicyVersionId;
          freezeFields = {
            pricingPolicyVersionId: freeze.pricingPolicyVersionId,
            pricingProfileId: freeze.pricingProfileId,
            resolvedPriceKgs: freeze.resolvedPriceKgs,
            baseCostKgs: freeze.baseCostKgs,
            baseBranchPriceKgs: freeze.baseBranchPriceKgs,
            appliedRuleType: freeze.appliedRuleType,
            appliedRuleId: freeze.appliedRuleId,
            appliedAdjustmentMode: freeze.appliedAdjustmentMode,
            appliedAdjustmentValue: freeze.appliedAdjustmentValue,
            priceResolvedAt: freeze.priceResolvedAt,
          };
        } catch {
          // Keep sale creatable even if pricing engine cannot resolve; unitPrice remains source of truth for charged amount.
        }
      }

      items.push({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        totalPrice,
        totalCost,
        profitAmount,
        priceAboveRecommendedReasonCode: item.priceAboveRecommendedReasonCode ?? null,
        priceAboveRecommendedComment: item.priceAboveRecommendedComment ?? null,
        ...freezeFields,
      });
    }

    const totalAmount = this.roundMoney(items.reduce((sum, item) => sum + item.totalPrice, 0));
    const totalCost = this.roundMoney(items.reduce((sum, item) => sum + item.totalCost, 0));

    return {
      items,
      totalAmount,
      totalCost,
      profitAmount: this.roundMoney(totalAmount - totalCost),
      pricingPolicyVersionId,
    };
  }

  private calculateSale(dto: CreateSaleDto) {
    const items = dto.items.map((item) => {
      const totalPrice = this.roundMoney(item.quantity * item.unitPrice);
      const totalCost = this.roundMoney(item.quantity * item.unitCost);
      const profitAmount = this.roundMoney(totalPrice - totalCost);

      return {
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        totalPrice,
        totalCost,
        profitAmount,
        priceAboveRecommendedReasonCode: item.priceAboveRecommendedReasonCode ?? null,
        priceAboveRecommendedComment: item.priceAboveRecommendedComment ?? null,
      };
    });
    const totalAmount = this.roundMoney(
      items.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    const totalCost = this.roundMoney(
      items.reduce((sum, item) => sum + item.totalCost, 0),
    );

    return {
      items,
      totalAmount,
      totalCost,
      profitAmount: this.roundMoney(totalAmount - totalCost),
    };
  }

  private buildInstallmentCreate(
    dto: CreateSaleDto,
    branchId: string,
    customerId: string,
    debtAmount: number,
    saleDate: Date,
  ) {
    if (dto.paymentType === 'INSTALLMENT') {
      return undefined;
    }

    if (!(debtAmount > 0 && (dto.installmentDays || dto.dueDate))) {
      return undefined;
    }

    return {
      create: {
        branchId,
        customerId,
        dueDate:
          dto.dueDate ??
          new Date(
            saleDate.getTime() +
              (dto.installmentDays ?? 0) * 24 * 60 * 60 * 1000,
          ),
        amount: debtAmount,
        paidAmount: 0,
        status: InstallmentStatus.PENDING,
      },
    };
  }

  private saleInclude() {
    return {
      branch: true,
      customer: true,
      seller: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
      items: true,
      payments: {
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { paidAt: 'desc' as const },
      },
      installments: {
        orderBy: { dueDate: 'asc' as const },
      },
      installmentApproval: {
        include: {
          submittedBy: { select: { id: true, fullName: true, role: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
          rejectedBy: { select: { id: true, fullName: true, role: true } },
        },
      },
      receipt: true,
    };
  }

  private async getCustomerForSale(
    tx: PrismaTx,
    user: AuthUser,
    customerId: string,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { branch: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    this.ensureBranchAccess(user, customer.branchId);
    return customer;
  }

  private resolvePricingChannelFromCustomer(customerType: CustomerType): SalePricingChannel {
    return resolvePricingChannelFromCustomerType(customerType);
  }

  private applyCustomerPricingChannels(
    customer: { customerType: CustomerType },
    dto: CreateSaleDto,
  ) {
    const channel = this.resolvePricingChannelFromCustomer(customer.customerType);
    for (const item of dto.items) {
      item.pricingChannel = channel;
    }
  }

  /**
   * Backend is the single source of truth for Branch Sale unit prices:
   * Customer Type price → loyalty discount → minimum price floor.
   * Branch users cannot override the calculated selling price.
   */
  private async applyAutomaticSalePricing(
    user: AuthUser,
    customer: {
      id: string;
      branchId: string;
      customerType: CustomerType;
      loyaltyCategory?: CustomerLoyaltyCategory | null;
    },
    dto: CreateSaleDto,
  ) {
    const channel = this.resolvePricingChannelFromCustomer(customer.customerType);
    const loyaltyConfig = await this.loyaltyProgramSettingsService.getConfig();
    const loyaltyCategory = customer.loyaltyCategory ?? CustomerLoyaltyCategory.STANDARD;
    const loyaltyDiscountPercent = getLoyaltyDiscountPercent(loyaltyCategory, loyaltyConfig);
    const allowManualOverride = hasAnyFullAccessRole(resolveUserRoles(user));

    for (const item of dto.items) {
      if (!item.productId) continue;
      item.pricingChannel = channel;

      const basePrice = await this.resolveRecommendedChannelPrice(
        customer.branchId,
        item.productId,
        channel,
      );
      if (basePrice == null || basePrice <= 0) {
        continue;
      }

      const minimumPrice =
        (await this.resolveChannelMinimumPrice(customer.branchId, item.productId, channel)) ?? 0;

      const priced = calculateFinalSaleUnitPrice({
        basePriceKgs: basePrice,
        loyaltyDiscountPercent,
        minimumPriceKgs: minimumPrice,
      });

      const clientPrice = roundDisplayMoney(Number(item.unitPrice || 0));
      if (!allowManualOverride && Math.abs(clientPrice - priced.finalPriceKgs) > 0.01) {
        // Overwrite client-supplied price; Branch Sales cannot override calculated price.
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'PRICE_OVERRIDE_REJECTED',
            entity: 'Customer',
            entityId: customer.id,
            metadata: {
              customerId: customer.id,
              productId: item.productId,
              oldValue: clientPrice,
              newValue: priced.finalPriceKgs,
              userId: user.id,
              branchId: customer.branchId,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }

      item.unitPrice = priced.finalPriceKgs;

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'AUTO_PRICE_SELECTED',
          entity: 'Customer',
          entityId: customer.id,
          metadata: {
            customerId: customer.id,
            productId: item.productId,
            customerType: customer.customerType,
            pricingChannel: channel,
            oldValue: clientPrice,
            newValue: priced.finalPriceKgs,
            basePriceKgs: priced.basePriceKgs,
            userId: user.id,
            branchId: customer.branchId,
            timestamp: new Date().toISOString(),
          },
        },
      });

      if (priced.discountPercent > 0) {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            role: user.role,
            action: 'LOYALTY_DISCOUNT_APPLIED',
            entity: 'Customer',
            entityId: customer.id,
            metadata: {
              customerId: customer.id,
              productId: item.productId,
              loyaltyCategory,
              oldValue: priced.basePriceKgs,
              newValue: priced.finalPriceKgs,
              discountPercent: priced.discountPercent,
              discountAmountKgs: priced.discountAmountKgs,
              minimumPriceApplied: priced.minimumPriceApplied,
              userId: user.id,
              branchId: customer.branchId,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    }
  }

  private assertCustomerAllowedForBranchSale(
    customer: {
      customerType: CustomerType;
    },
    items: Array<{ pricingChannel?: SalePricingChannel }>,
  ) {
    try {
      assertBranchSaleCustomerTypeAllowed(customer.customerType);
      for (const item of items) {
        assertSalePricingChannelMatchesCustomer(
          customer.customerType,
          item.pricingChannel,
        );
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid customer type for branch sale',
      );
    }
  }

  private async assertSaleItemsResolvablePricing(
    user: AuthUser,
    branchId: string,
    items: Array<{ productId?: string; pricingChannel?: SalePricingChannel }>,
  ) {
    if (hasAnyFullAccessRole(resolveUserRoles(user))) {
      return;
    }

    for (const item of items) {
      if (!item.productId) continue;
      const channel = (item.pricingChannel ?? 'RETAIL') as SalePricingChannel;
      const resolvedPrice = await this.resolveRecommendedChannelPrice(
        branchId,
        item.productId,
        channel,
      );

      if (!resolvedPrice || resolvedPrice <= 0) {
        await this.notifyMissingSalePricingPolicy(user, branchId, item.productId, channel);
        throw new BadRequestException(missingSalePricingPolicyMessage(channel));
      }
    }
  }

  private async notifyMissingSalePricingPolicy(
    user: AuthUser,
    branchId: string,
    productId: string,
    channel: SalePricingChannel,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { sku: true, name: true },
    });
    const label =
      channel === 'WHOLESALE' ? 'оптовая' : channel === 'MASTER' ? 'Master' : 'розничная';
    await this.notificationsService.notify(user, {
      type: AlertType.BRANCH_REQUEST_NO_PRICING_POLICY,
      branchId,
      title: 'Требуется ценовая политика',
      message: `При продаже товара ${product?.sku ?? productId} (${product?.name ?? ''}) не настроена ${label} ценовая политика.`,
      entityType: 'Product',
      entityId: productId,
      recipientRoles: [Role.CEO, Role.OWNER],
    });
  }

  private async getAccessibleSale(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: this.saleInclude(),
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private async getAccessibleSaleInTx(
    tx: PrismaTx,
    user: AuthUser,
    id: string,
  ) {
    const sale = await tx.sale.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllBranches(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        installments: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private buildBranchWhere(user: AuthUser, requestedBranchId?: string) {
    if (this.canAccessAllBranches(user)) {
      return requestedBranchId ? { branchId: requestedBranchId } : {};
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: user.branchId };
  }

  private async getProductWarehouseId(tx: PrismaTx, productId: string) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { warehouseId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product.warehouseId;
  }

  private ensureBranchAccess(user: AuthUser, branchId: string) {
    if (!this.canAccessAllBranches(user) && user.branchId !== branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }
  }

  private async generateReceiptNumber(tx: PrismaTx, saleDate: Date) {
    const datePart = saleDate.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await tx.sale.count({
      where: {
        saleDate: {
          gte: new Date(
            saleDate.getFullYear(),
            saleDate.getMonth(),
            saleDate.getDate(),
          ),
        },
      },
    });

    return `EM-${datePart}-${String(count + 1).padStart(5, '0')}`;
  }

  private async refreshSalePaymentState(tx: PrismaTx, saleId: string) {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      select: { totalAmount: true },
    });
    const paymentAggregate = await tx.payment.aggregate({
      where: { saleId, status: PaymentRecordStatus.ACTIVE },
      _sum: { amount: true },
    });
    const paidAmount = this.roundMoney(
      Number(paymentAggregate._sum.amount ?? 0),
    );
    const totalAmount = Number(sale.totalAmount);
    const debtAmount = this.roundMoney(Math.max(totalAmount - paidAmount, 0));

    await tx.sale.update({
      where: { id: saleId },
      data: {
        paidAmount,
        debtAmount,
        paymentStatus: this.getPaymentStatus(totalAmount, paidAmount),
      },
    });
    await this.refreshInstallments(tx, saleId, paidAmount);
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

  private canAccessAllBranches(user: AuthUser) {
    return hasAnyHqRole(user.roles?.length ? user.roles : [user.role]);
  }

  private hasFullAccess(user: AuthUser) {
    return hasAnyFullAccessRole(user.roles?.length ? user.roles : [user.role]);
  }

  private getPaymentStatus(totalAmount: number, paidAmount: number) {
    if (paidAmount >= totalAmount) {
      return PaymentStatus.PAID;
    }

    if (paidAmount > 0) {
      return PaymentStatus.PARTIAL;
    }

    return PaymentStatus.DEBT;
  }

  private async refreshInstallments(
    tx: PrismaTx,
    saleId: string,
    salePaidAmount: number,
  ) {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        installments: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!sale) {
      return;
    }

    let remainingPaid = salePaidAmount;

    for (const installment of sale.installments) {
      const amount = Number(installment.amount);
      const paidAmount = this.roundMoney(Math.min(remainingPaid, amount));
      remainingPaid = this.roundMoney(Math.max(remainingPaid - amount, 0));
      const status =
        paidAmount >= amount
          ? InstallmentStatus.PAID
          : paidAmount > 0
            ? InstallmentStatus.PARTIAL
            : installment.dueDate < new Date()
              ? InstallmentStatus.OVERDUE
              : InstallmentStatus.PENDING;

      await tx.installmentSchedule.update({
        where: { id: installment.id },
        data: { paidAmount, status },
      });
    }
  }

  private async refreshCustomerFinancials(
    tx: PrismaTx,
    customerId: string,
    options?: { userId?: string; role?: string; branchId?: string },
  ) {
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: SaleStatus.FINALIZED,
      },
      select: {
        totalAmount: true,
        profitAmount: true,
        debtAmount: true,
        saleDate: true,
        branchId: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        totalPurchaseAmount: this.sumDecimals(
          sales.map((sale) => sale.totalAmount),
        ),
        totalProfitAmount: this.sumDecimals(
          sales.map((sale) => sale.profitAmount),
        ),
        totalDebtAmount: this.sumDecimals(sales.map((sale) => sale.debtAmount)),
        lastPurchaseAt: sales[0]?.saleDate ?? null,
      },
    });

    if (options?.userId && options.role && options.branchId) {
      await this.loyaltyProgramSettingsService.refreshCustomerLoyalty(tx, {
        customerId,
        branchId: options.branchId,
        userId: options.userId,
        role: options.role,
      });
    } else if (sales[0]) {
      await this.loyaltyProgramSettingsService.refreshCustomerLoyalty(tx, {
        customerId,
        branchId: sales[0].branchId,
        userId: 'system',
        role: 'SYSTEM',
      });
    }
  }

  private buildReceiptText(input: {
    receiptNumber: string;
    customerName: string;
    customerPhone: string;
    sellerName: string;
    saleDate: Date;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice?: number | Prisma.Decimal;
      totalPrice?: number | Prisma.Decimal;
    }>;
    totalAmount: number;
    paidAmount: number;
    debtAmount: number;
    paymentStatus: PaymentStatus;
    receiptStatus: 'DRAFT' | 'FINAL';
    payments?: Array<{
      method: PaymentMethod;
      amount: number | Prisma.Decimal;
      cashReceived?: number | Prisma.Decimal | null;
      changeAmount?: number | Prisma.Decimal | null;
      status?: PaymentRecordStatus;
    }>;
  }) {
    const itemLines = input.items
      .map((item) => {
        const total =
          item.totalPrice !== undefined
            ? Number(item.totalPrice)
            : item.quantity * Number(item.unitPrice ?? 0);
        return `- ${item.productName} x ${item.quantity}: ${total.toFixed(2)} KGS`;
      })
      .join('\n');

    const activePayments = (input.payments ?? []).filter(
      (payment) => payment.status !== PaymentRecordStatus.VOID,
    );
    const paymentLines =
      activePayments.length > 0
        ? [
            'Payment methods:',
            ...activePayments.map(
              (payment) =>
                `- ${payment.method}: ${Number(payment.amount).toFixed(2)} KGS`,
            ),
            `Total paid: ${input.paidAmount.toFixed(2)} KGS`,
            ...activePayments
              .filter((payment) => payment.method === PaymentMethod.CASH)
              .flatMap((payment) => {
                const lines: string[] = [];
                if (payment.cashReceived != null) {
                  lines.push(
                    `Cash received: ${Number(payment.cashReceived).toFixed(2)} KGS`,
                  );
                }
                if (payment.changeAmount != null && Number(payment.changeAmount) > 0) {
                  lines.push(
                    `Change: ${Number(payment.changeAmount).toFixed(2)} KGS`,
                  );
                }
                return lines;
              }),
          ]
        : [];

    return [
      `EMOTORS ${input.receiptStatus} RECEIPT`,
      `Receipt: ${input.receiptNumber}`,
      `Date: ${input.saleDate.toLocaleString()}`,
      `Seller: ${input.sellerName}`,
      `Customer: ${input.customerName}`,
      `Phone: ${input.customerPhone}`,
      '',
      itemLines,
      '',
      `Total: ${input.totalAmount.toFixed(2)} KGS`,
      `Paid: ${input.paidAmount.toFixed(2)} KGS`,
      `Debt: ${input.debtAmount.toFixed(2)} KGS`,
      ...paymentLines,
      `Status: ${input.paymentStatus}`,
    ].join('\n');
  }

  private toSaleResponse(sale: any) {
    return {
      ...sale,
      totalAmount: Number(sale.totalAmount),
      totalCost: Number(sale.totalCost),
      profitAmount: Number(sale.profitAmount),
      paidAmount: Number(sale.paidAmount),
      debtAmount: Number(sale.debtAmount),
      items: sale.items?.map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        unitCost: Number(item.unitCost),
        totalPrice: Number(item.totalPrice),
        totalCost: Number(item.totalCost),
        profitAmount: Number(item.profitAmount),
      })),
      payments: sale.payments?.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount),
        cashReceived:
          payment.cashReceived != null ? Number(payment.cashReceived) : null,
        changeAmount:
          payment.changeAmount != null ? Number(payment.changeAmount) : null,
      })),
      installments: sale.installments?.map((installment: any) => ({
        ...installment,
        amount: Number(installment.amount),
        paidAmount: Number(installment.paidAmount),
      })),
      installmentApproval: sale.installmentApproval
        ? this.saleInstallmentApprovalService.serializeApproval(sale.installmentApproval)
        : null,
    };
  }

  private sanitizeSaleForUser(user: AuthUser, sale: ReturnType<SalesService['toSaleResponse']>) {
    if (!shouldStripSaleFinancialFields(user) && !shouldStripSaleWorkflowStatus(user)) {
      return sale;
    }

    const sanitized = { ...sale };
    if (shouldStripSaleFinancialFields(user)) {
      delete sanitized.profitAmount;
      delete sanitized.totalCost;
      if (Array.isArray(sanitized.items)) {
        sanitized.items = sanitized.items.map((item: Record<string, unknown>) => {
          const next = { ...item };
          delete next.unitCost;
          delete next.totalCost;
          delete next.profitAmount;
          return next;
        });
      }
    }
    if (shouldStripSaleWorkflowStatus(user)) {
      delete sanitized.status;
    }
    return sanitized;
  }

  private async enrichSaleItemsFromProducts(
    user: AuthUser,
    branchId: string,
    dto: CreateSaleDto,
  ) {
    if (hasAnyFullAccessRole(resolveUserRoles(user))) {
      return;
    }

    for (const item of dto.items) {
      if (!item.productId) {
        continue;
      }

      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          branchId,
          deletedAt: null,
          isActive: true,
          warehouse: activeBranchWarehouseWhere,
        },
        select: {
          name: true,
          sku: true,
          finalCostKgs: true,
          sellingPriceKgs: true,
          recommendedRetailPriceKgs: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product not found: ${item.productId}`);
      }

      item.productName = product.name;
      item.productSku = product.sku;
      item.unitCost = Number(product.finalCostKgs || 0);
    }
  }

  private async validateSaleStock(
    user: AuthUser,
    branchId: string,
    items: CreateSaleDto['items'],
  ) {
    if (hasAnyFullAccessRole(resolveUserRoles(user))) {
      return;
    }

    for (const item of items) {
      if (!item.productId) {
        continue;
      }

      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          branchId,
          deletedAt: null,
          warehouse: activeBranchWarehouseWhere,
        },
        select: {
          id: true,
          name: true,
          branchId: true,
          warehouseId: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product not found: ${item.productId}`);
      }

      if (user.branchId && product.branchId !== user.branchId) {
        throw new ForbiddenException('You can only access your own branch');
      }

      const balance = await this.prisma.inventoryBalance.findFirst({
        where: {
          warehouseId: product.warehouseId,
          productId: product.id,
          branchId: product.branchId,
        },
      });
      const availableQty = Math.max(
        (balance?.quantity ?? 0) - (balance?.reservedQuantity ?? 0),
        0,
      );

      if (item.quantity > availableQty) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${availableQty}`,
        );
      }
    }
  }

  private audit(
    user: AuthUser,
    branchId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    return this.prisma.auditLog.create({
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

  private sumDecimals(values: Prisma.Decimal[]) {
    return this.roundMoney(
      values.reduce((sum, value) => sum + Number(value ?? 0), 0),
    );
  }

  private sumPayments(
    payments: Array<{ amount: Prisma.Decimal; method: PaymentMethod }>,
    methods: PaymentMethod[],
  ) {
    return this.sumDecimals(
      payments
        .filter((payment) => methods.includes(payment.method))
        .map((payment) => payment.amount),
    );
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
