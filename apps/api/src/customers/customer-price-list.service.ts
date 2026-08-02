import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerLoyaltyCategory,
  CustomerPriceListShareChannel,
  CustomerPriceListShareStatus,
  CustomerStatus,
  CustomerType,
  Prisma,
} from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs } from '../common/authoritative-money.util';
import { BranchPricingPolicyService } from './branch-pricing-policy.service';
import { calculateFinalSaleUnitPrice } from './customer-loyalty.util';
import { LoyaltyProgramSettingsService } from './loyalty-program-settings.service';
import { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyFullAccessRole, hasAnyHqRole, resolveUserRoles } from '../rbac/rbac';
import {
  minimumPriceTypeForChannel,
  recommendedPriceTypeForChannel,
  resolvePricingChannelFromCustomerType,
} from '../sales/sale-customer-pricing.util';
import { activeBranchWarehouseWhere } from '../warehouse/warehouse.util';
import { writeCustomerPriceListPdf } from './customer-price-list-pdf.util';
import {
  PRICE_LIST_VALIDITY_NOTE,
  assertSafePriceListPayload,
  buildPriceListWhatsAppMessage,
  buildWhatsAppDeepLink,
  customerTypeRuLabel,
  formatAvailabilityLabel,
  isBranchPriceListCustomerType,
  loyaltyCategoryRuLabel,
  normalizeWhatsAppPhoneDigits,
  priceListTitleForCustomerType,
  resolvePriceListCategoryMarkupPercent,
  toCustomerFacingPriceListDto,
  type InternalCustomerPriceListSnapshot,
  type InternalPriceListProduct,
} from './customer-price-list.util';

@Injectable()
export class CustomerPriceListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingResolution: PricingResolutionService,
    private readonly loyaltyProgramSettingsService: LoyaltyProgramSettingsService,
    private readonly branchPricingPolicyService: BranchPricingPolicyService,
  ) {}

  async searchCustomers(user: AuthUser, search?: string) {
    const branchId = this.requireBranchId(user);
    const term = search?.trim();
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      branchId,
      status: { not: CustomerStatus.ARCHIVED },
      customerType: {
        in: [CustomerType.RETAIL, CustomerType.MASTER, CustomerType.WHOLESALE],
      },
    };

    if (term) {
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { whatsappPhone: { contains: term, mode: 'insensitive' } },
        { companyName: { contains: term, mode: 'insensitive' } },
        { id: { contains: term, mode: 'insensitive' } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsappPhone: true,
        customerType: true,
        loyaltyCategory: true,
        status: true,
        branchId: true,
        purchaseVolume: true,
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    return Promise.all(
      customers.map(async (customer) => {
        const purchaseVolume90Days = await this.loyaltyProgramSettingsService.computePurchaseVolume(
          this.prisma,
          customer.id,
        );
        return {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          whatsappPhone: customer.whatsappPhone,
          customerType: customer.customerType,
          customerTypeLabel: customerTypeRuLabel(customer.customerType),
          loyaltyCategory: customer.loyaltyCategory,
          loyaltyCategoryLabel: loyaltyCategoryRuLabel(customer.loyaltyCategory),
          purchaseVolume90Days,
          status: customer.status,
          branchId: customer.branchId,
          branchName: customer.branch.name,
        };
      }),
    );
  }

  async preview(user: AuthUser, customerId: string) {
    const built = await this.buildPriceList(user, customerId);
    return toCustomerFacingPriceListDto(built.snapshot);
  }

  async generate(user: AuthUser, customerId: string) {
    const built = await this.buildPriceList(user, customerId);
    const customerFacing = toCustomerFacingPriceListDto(built.snapshot);
    const fileName = `price-list-${customerId}-${Date.now()}.pdf`;
    const relativeDir = join('price-lists', built.customer.branchId);
    const absoluteDir = join(process.cwd(), 'uploads', relativeDir);
    const absoluteFilePath = join(absoluteDir, fileName);
    const fileUrl = `/uploads/${relativeDir}/${fileName}`.replace(/\\/g, '/');

    await writeCustomerPriceListPdf({
      dto: customerFacing,
      absoluteFilePath,
    });

    const record = await this.prisma.customerPriceList.create({
      data: {
        customerId: built.customer.id,
        branchId: built.customer.branchId,
        customerType: built.customer.customerType,
        loyaltyCategory: built.customer.loyaltyCategory,
        loyaltyDiscountPercent: built.loyaltyDiscountPercent,
        pricingPolicyVersionId: built.snapshot.pricingPolicyVersionId,
        title: customerFacing.title,
        productCount: customerFacing.productCount,
        currency: customerFacing.currency,
        fileName,
        filePath: absoluteFilePath,
        fileUrl,
        shareStatus: CustomerPriceListShareStatus.GENERATED,
        // Internal snapshot retains category/markup/volume for audit; PDF uses customer-facing DTO.
        snapshotJson: built.snapshot as unknown as Prisma.InputJsonValue,
        generatedById: user.id,
        generatedAt: new Date(built.snapshot.generatedAt),
      },
    });

    await this.audit(user, built.customer.branchId, 'BRANCH_CUSTOMER_PRICE_LIST_GENERATED', record.id, {
      customerId: built.customer.id,
      customerType: built.customer.customerType,
      customerCategory: built.customer.loyaltyCategory,
      purchaseVolume90Days: built.snapshot.purchaseVolume90Days,
      categoryMarkupPercent: built.snapshot.categoryMarkupPercent,
      pricingPolicyVersionId: built.snapshot.pricingPolicyVersionId,
      branchPricingPolicySource: built.snapshot.branchPricingPolicySource,
      productCount: customerFacing.productCount,
      generatedBy: user.id,
      channel: null,
      status: CustomerPriceListShareStatus.GENERATED,
    });

    return {
      priceListId: record.id,
      ...customerFacing,
      fileUrl: record.fileUrl,
      fileName: record.fileName,
      shareStatus: record.shareStatus,
      whatsappApiAvailable: false,
      whatsappRequiresManualPdfAttachment: true,
    };
  }

  async download(user: AuthUser, priceListId: string) {
    const record = await this.getAccessiblePriceList(user, priceListId);
    if (!record.filePath) {
      throw new NotFoundException('PDF файл прайс-листа не найден');
    }

    // Regenerate customer-facing PDF from internal audit snapshot so historical
    // downloads keep original prices but never expose loyalty/markup/SKU details.
    const snapshot = record.snapshotJson as InternalCustomerPriceListSnapshot | null;
    let regenerated = false;
    if (snapshot && Array.isArray(snapshot.products) && snapshot.products.length > 0) {
      try {
        const customerFacing = toCustomerFacingPriceListDto(snapshot);
        await writeCustomerPriceListPdf({
          dto: customerFacing,
          absoluteFilePath: record.filePath,
        });
        regenerated = true;
      } catch {
        regenerated = false;
      }
    }
    if (!regenerated && !existsSync(record.filePath)) {
      throw new NotFoundException('PDF файл прайс-листа не найден');
    }

    await this.prisma.customerPriceList.update({
      where: { id: record.id },
      data: {
        shareChannel: CustomerPriceListShareChannel.DOWNLOAD,
        shareStatus: CustomerPriceListShareStatus.DOWNLOADED,
        sharedAt: new Date(),
      },
    });

    await this.audit(user, record.branchId, 'BRANCH_CUSTOMER_PRICE_LIST_DOWNLOADED', record.id, {
      customerId: record.customerId,
      customerType: record.customerType,
      customerCategory: record.loyaltyCategory,
      pricingPolicyVersionId: record.pricingPolicyVersionId,
      productCount: record.productCount,
      generatedBy: record.generatedById,
      channel: CustomerPriceListShareChannel.DOWNLOAD,
      status: CustomerPriceListShareStatus.DOWNLOADED,
    });

    return {
      stream: createReadStream(record.filePath),
      fileName: record.fileName ?? `price-list-${record.id}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async openWhatsApp(user: AuthUser, priceListId: string) {
    const record = await this.getAccessiblePriceList(user, priceListId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: record.customerId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsappPhone: true,
        customerType: true,
        branch: { select: { name: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const phoneDigits = normalizeWhatsAppPhoneDigits(
      customer.whatsappPhone || customer.phone,
    );
    if (!phoneDigits) {
      throw new BadRequestException('У клиента указан некорректный номер телефона.');
    }

    const message = buildPriceListWhatsAppMessage({
      customerName: customer.fullName,
      branchName: customer.branch.name,
      generatedAt: record.generatedAt,
    });
    const whatsappLink = buildWhatsAppDeepLink(phoneDigits, message);

    await this.prisma.customerPriceList.update({
      where: { id: record.id },
      data: {
        shareChannel: CustomerPriceListShareChannel.WHATSAPP,
        shareStatus: CustomerPriceListShareStatus.WHATSAPP_OPENED,
        sharedAt: new Date(),
      },
    });

    await this.audit(user, record.branchId, 'BRANCH_CUSTOMER_PRICE_LIST_WHATSAPP_OPENED', record.id, {
      customerId: record.customerId,
      customerType: record.customerType,
      customerCategory: record.loyaltyCategory,
      pricingPolicyVersionId: record.pricingPolicyVersionId,
      productCount: record.productCount,
      generatedBy: record.generatedById,
      channel: CustomerPriceListShareChannel.WHATSAPP,
      status: CustomerPriceListShareStatus.WHATSAPP_OPENED,
    });

    return {
      priceListId: record.id,
      whatsappLink,
      whatsappMessageText: message,
      phoneDigits,
      fileUrl: record.fileUrl,
      fileName: record.fileName,
      /** Honest capability flag: no WhatsApp Business API is configured. */
      whatsappApiAvailable: false,
      whatsappRequiresManualPdfAttachment: true,
      shareStatus: CustomerPriceListShareStatus.WHATSAPP_OPENED,
    };
  }

  async history(user: AuthUser, customerId?: string) {
    const branchId = this.requireBranchId(user);
    const records = await this.prisma.customerPriceList.findMany({
      where: {
        branchId,
        ...(customerId ? { customerId } : {}),
      },
      select: {
        id: true,
        customerId: true,
        customerType: true,
        loyaltyCategory: true,
        loyaltyDiscountPercent: true,
        pricingPolicyVersionId: true,
        title: true,
        productCount: true,
        fileUrl: true,
        fileName: true,
        shareChannel: true,
        shareStatus: true,
        sharedAt: true,
        generatedAt: true,
        generatedById: true,
        customer: { select: { fullName: true, phone: true } },
        generatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });

    return records.map((row) => ({
      priceListId: row.id,
      customerId: row.customerId,
      customerName: row.customer.fullName,
      customerPhone: row.customer.phone,
      customerType: row.customerType,
      customerTypeLabel: customerTypeRuLabel(row.customerType),
      loyaltyCategory: row.loyaltyCategory,
      loyaltyDiscountPercent: toApiMoneyKgs(row.loyaltyDiscountPercent),
      pricingPolicyVersionId: row.pricingPolicyVersionId,
      title: row.title,
      productCount: row.productCount,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      shareChannel: row.shareChannel,
      shareStatus: row.shareStatus,
      sharedAt: row.sharedAt,
      generatedAt: row.generatedAt,
      generatedBy: row.generatedBy,
    }));
  }

  private async buildPriceList(user: AuthUser, customerId: string) {
    const branchId = this.requireBranchId(user);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: {
        branch: {
          select: { id: true, name: true, phone: true, address: true, code: true },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.branchId !== branchId && !hasAnyFullAccessRole(resolveUserRoles(user))) {
      throw new ForbiddenException('You can only access customers from your own branch');
    }
    if (customer.status === CustomerStatus.ARCHIVED || customer.status === CustomerStatus.INACTIVE) {
      throw new BadRequestException('Нельзя сформировать прайс для неактивного клиента.');
    }
    if (!isBranchPriceListCustomerType(customer.customerType)) {
      throw new BadRequestException('У клиента не указан тип клиента.');
    }

    const channel = resolvePricingChannelFromCustomerType(customer.customerType);
    const branchPolicy = await this.branchPricingPolicyService.getEffectivePolicy(
      customer.branchId,
    );
    const loyaltyCategory = customer.loyaltyCategory ?? CustomerLoyaltyCategory.STANDARD;
    let categoryMarkupPercent: number;
    try {
      categoryMarkupPercent = resolvePriceListCategoryMarkupPercent(
        branchPolicy,
        loyaltyCategory,
        customer.customerType,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Markup rule is missing',
      );
    }
    const purchaseVolume90Days = await this.loyaltyProgramSettingsService.computePurchaseVolume(
      this.prisma,
      customer.id,
    );

    const activeVersion = await this.prisma.pricingPolicyVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    if (!activeVersion) {
      throw new BadRequestException('Для данного типа клиента не настроен прайс. Нет активной ценовой политики.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { ...activeBranchWarehouseWhere, branchId: customer.branchId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) {
      throw new BadRequestException('Не найдены товары с настроенными ценами.');
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        warehouseId: warehouse.id,
        branchId: customer.branchId,
        product: {
          branchId: customer.branchId,
          deletedAt: null,
          isActive: true,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            category: true,
            photoUrl: true,
            productCategory: { select: { nameRu: true, nameEn: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });

    const products: InternalPriceListProduct[] = [];
    let pricingPolicyVersionId: string | null = activeVersion.id;

    for (const balance of balances) {
      const product = balance.product;
      let basePrice = 0;
      let minPrice = 0;
      try {
        const [recommended, minimum] = await Promise.all([
          this.pricingResolution.resolveWithFreeze(customer.branchId, product.id, {
            priceType: recommendedPriceTypeForChannel(channel),
          }),
          this.pricingResolution.resolveWithFreeze(customer.branchId, product.id, {
            priceType: minimumPriceTypeForChannel(channel),
          }),
        ]);
        basePrice = toApiMoneyKgs(recommended.resolvedPriceKgs);
        minPrice = toApiMoneyKgs(minimum.resolvedPriceKgs);
        pricingPolicyVersionId =
          recommended.pricingPolicyVersionId ?? pricingPolicyVersionId;
      } catch {
        continue;
      }

      if (!(basePrice > 0)) continue;

      const priced = calculateFinalSaleUnitPrice({
        basePriceKgs: basePrice,
        loyaltyMarkupPercent: categoryMarkupPercent,
        minimumPriceKgs: minPrice,
      });
      const availableQty = Math.max(balance.quantity - (balance.reservedQuantity ?? 0), 0);
      const availability = formatAvailabilityLabel(availableQty);

      products.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category:
          product.productCategory?.nameRu ??
          product.productCategory?.nameEn ??
          product.category ??
          null,
        unit: product.unit ?? null,
        photoUrl: product.photoUrl ?? null,
        availabilityStatus: availability.availabilityStatus,
        availabilityLabel: availability.availabilityLabel,
        customerPriceKgs: priced.finalPriceKgs,
        currency: 'KGS',
      });
    }

    if (products.length === 0) {
      throw new BadRequestException('Не найдены товары с настроенными ценами.');
    }

    const snapshot: InternalCustomerPriceListSnapshot = {
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.whatsappPhone || customer.phone,
      customerType: customer.customerType,
      customerTypeLabel: customerTypeRuLabel(customer.customerType),
      loyaltyCategory,
      loyaltyCategoryLabel: loyaltyCategoryRuLabel(loyaltyCategory),
      categoryMarkupPercent,
      loyaltyDiscountPercent: categoryMarkupPercent,
      purchaseVolume90Days,
      branchId: customer.branchId,
      branchName: customer.branch.name,
      branchPhone: customer.branch.phone,
      branchAddress: customer.branch.address,
      branchPricingPolicySource: branchPolicy.source,
      title: priceListTitleForCustomerType(customer.customerType),
      pricingChannel: channel,
      pricingPolicyVersionId,
      generatedAt: new Date().toISOString(),
      currency: 'KGS',
      validityNote: PRICE_LIST_VALIDITY_NOTE,
      productCount: products.length,
      products,
      whatsappApiAvailable: false,
    };

    // Internal snapshot may retain SKU/category/availability for audit; forbid cost fields only.
    assertSafePriceListPayload(snapshot as unknown as Record<string, unknown>);

    return {
      customer,
      loyaltyDiscountPercent: categoryMarkupPercent,
      snapshot,
    };
  }

  private async getAccessiblePriceList(user: AuthUser, priceListId: string) {
    const branchId = this.requireBranchId(user);
    const record = await this.prisma.customerPriceList.findFirst({
      where: {
        id: priceListId,
        ...(hasAnyFullAccessRole(resolveUserRoles(user)) ? {} : { branchId }),
      },
    });
    if (!record) throw new NotFoundException('Price list not found');
    return record;
  }

  private requireBranchId(user: AuthUser) {
    if (hasAnyHqRole(user.roles?.length ? user.roles : [user.role]) && !user.branchId) {
      // HQ without branch context cannot generate branch customer price lists here.
      throw new ForbiddenException('Branch context is required for customer price lists');
    }
    if (!user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }
    return user.branchId;
  }

  private audit(
    user: AuthUser,
    branchId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'CustomerPriceList',
        entityId,
        metadata: {
          branchId,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  }
}
