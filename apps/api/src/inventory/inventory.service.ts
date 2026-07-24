import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, HqWarehouseAssignmentStatus, Prisma, ProcurementOrderStatus, PurchasePriceChangeReason, Role, StockMovementStatus, StockMovementType, WarehouseType } from '@prisma/client';
import { MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeBranchId, resolveWritableBranchId } from '../rbac/branch-scope';
import {
  assertProductWarehouseBranchMatch,
  activeBranchWarehouseWhere,
  activeHqWarehouseWhere,
  branchWarehouseWhere,
  HQ_CATALOG_BRANCH_CODE,
  hqWarehouseWhere,
  inventoryBranchIdForWarehouse,
  isHqWarehouse,
} from '../warehouse/warehouse.util';
import { PrismaService } from '../prisma/prisma.service';
import { ensureHqCatalogBranch } from '../product-catalog/hq-product-catalog.util';
import { ensureBranchProductForReceivingInTx } from '../distribution/branch-receiving-product.util';
import { HQ_WAREHOUSE_ACCESS_DENIED, HQ_WAREHOUSE_ACCESS_DENIED_MESSAGES } from '../hq-warehouse/hq-warehouse-assignment.constants';
import { canArchiveProduct, canBranchSalesManagerModifyStock, canCreateProduct, canEditProductUnit, canEditPurchasePriceYuan, canEditSellingPrice, canManageProductCatalog, canViewProductCatalog, hasAnyFullAccessRole, isFullAccessRole, isBranchWarehouseOperator, resolveUserRoles } from '../rbac/rbac';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePriceHistoryDto } from './dto/create-price-history.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateYuanRateDto } from './dto/create-yuan-rate.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdatePurchasePriceDto } from './dto/update-purchase-price.dto';
import { PurchasePriceHistoryQueryDto } from './dto/purchase-price-history-query.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CATEGORY_CHANGE_MIGRATION_NAME } from './product-code-migration.util';
import {
  getCategoryCodePrefix,
  isValidCategoryCodePrefix,
  isValidProductCode,
  nextProductBarcode,
  nextProductCode,
  normalizeCategoryCodePrefix,
  normalizeProductCode,
  resolveCategoryProductCodePrefix,
} from './product-code.util';
import { buildLogisticsWithCargo, calculateLandedCosts, CARGO_WEIGHT_LESS_THAN_NET, extractCargoConfig, extractLogisticsCosts, mapStoredProcurementItemToLandedCostInput } from '../procurement/landed-cost.util';
import { PricingFifoService } from '../pricing/pricing-fifo.service';
import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';
import { mapProductCatalogFifoCost } from './product-catalog-fifo-cost.util';

type PrismaTx = Prisma.TransactionClient;

const SELLING_PRICE_EDIT_DENIED_MESSAGE =
  'Supply Chain Manager cannot change selling price. | Supply Chain Manager не может изменять цену продажи. | Supply Chain Manager сатуу баасын өзгөртө албайт.';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingFifoService: PricingFifoService,
  ) {}

  async uploadProductImage(request: FastifyRequest) {
    let image: MultipartFile | undefined;

    try {
      image = await request.file();
    } catch {
      throw new BadRequestException('File is too large');
    }

    if (!image) {
      throw new BadRequestException('Image file is required');
    }

    if (image.fieldname !== 'image') {
      throw new BadRequestException('Invalid upload field');
    }

    const allowedMimeTypes = new Map([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
    ]);
    const extensionFromMime = allowedMimeTypes.get(image.mimetype);
    const originalExtension = extname(image.filename).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!extensionFromMime || !allowedExtensions.includes(originalExtension)) {
      throw new BadRequestException('Invalid file format');
    }

    const buffer = await image.toBuffer();

    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File is too large');
    }

    const uploadDirectory = join(process.cwd(), 'uploads', 'products');
    await mkdir(uploadDirectory, { recursive: true });

    const extension = originalExtension === '.jpeg' ? '.jpg' : extensionFromMime;
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(uploadDirectory, filename), buffer);

    return {
      url: `/uploads/products/${filename}`,
    };
  }

  async categories(search?: string) {
    const where: Prisma.ProductCategoryWhereInput = {};

    if (search?.trim()) {
      const value = search.trim();
      where.OR = [
        { code: { contains: value, mode: 'insensitive' } },
        { nameKy: { contains: value, mode: 'insensitive' } },
        { nameRu: { contains: value, mode: 'insensitive' } },
        { nameEn: { contains: value, mode: 'insensitive' } },
      ];
    }

    const categories = await this.prisma.productCategory.findMany({
      where,
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { nameEn: 'asc' },
    });

    return categories.map((category) => ({
      id: category.id,
      code: category.code,
      nameKy: category.nameKy,
      nameRu: category.nameRu,
      nameEn: category.nameEn,
      description: category.description,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      productCount: category._count.products,
    }));
  }

  async createCategory(user: AuthUser, dto: CreateCategoryDto) {
    this.assertCanManageProductCatalog(user);
    const normalizedCode = normalizeCategoryCodePrefix(dto.code);
    if (!isValidCategoryCodePrefix(normalizedCode)) {
      throw new BadRequestException('Code prefix must be 1-3 uppercase Latin letters');
    }
    await this.ensureCategoryCodeAvailable(normalizedCode);
    const category = await this.prisma.productCategory.create({
      data: {
        code: normalizedCode,
        nameKy: dto.nameKy,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
    await this.auditCategory(user, 'CATEGORY_CREATED', category.id, { categoryId: category.id, newValue: category });
    await this.auditCategory(user, 'CATEGORY_PREFIX_CREATED', category.id, {
      userId: user.id,
      categoryId: category.id,
      prefix: category.code,
      timestamp: new Date().toISOString(),
    });
    return category;
  }

  async logCategoryCreateOpened(user: AuthUser) {
    this.assertCanManageProductCatalog(user);
    await this.auditCategory(user, 'CATEGORY_CREATE_OPENED', 'new', {
      action: 'CATEGORY_CREATE_OPENED',
      oldValue: null,
      newValue: null,
    });
    return { success: true };
  }

  async category(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      ...category,
      productCount: category._count.products,
    };
  }

  async updateCategory(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    this.assertCanManageProductCatalog(user);
    const existing = await this.category(id);

    let normalizedCode: string | undefined;
    if (dto.code) {
      normalizedCode = normalizeCategoryCodePrefix(dto.code);
      if (!isValidCategoryCodePrefix(normalizedCode)) {
        throw new BadRequestException('Code prefix must be 1-3 uppercase Latin letters');
      }
      await this.ensureCategoryCodeAvailable(normalizedCode, id);
    }

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        code: normalizedCode,
        nameKy: dto.nameKy,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        description: dto.description,
        isActive: dto.isActive,
      },
    });
    const action =
      dto.isActive === false && existing.isActive !== false ? 'CATEGORY_DISABLED' : 'CATEGORY_UPDATED';
    await this.auditCategory(user, action, id, { categoryId: id, oldValue: existing, newValue: category });
    if (normalizedCode && normalizedCode !== existing.code) {
      await this.auditCategory(user, 'CATEGORY_PREFIX_UPDATED', id, {
        userId: user.id,
        categoryId: id,
        prefix: normalizedCode,
        previousPrefix: existing.code,
        timestamp: new Date().toISOString(),
      });
    }
    return category;
  }

  async deleteCategory(user: AuthUser, id: string) {
    const roles = user.roles?.length ? user.roles : [user.role];
    if (!hasAnyFullAccessRole(roles)) {
      await this.auditCategory(user, 'CATEGORY_DELETE_DENIED', id, {
        reason: 'Only CEO can delete or archive categories',
      });
      throw new ForbiddenException('Only CEO can delete or archive categories');
    }
    const category = await this.category(id);

    if (category.productCount > 0) {
      const updated = await this.prisma.productCategory.update({
        where: { id },
        data: { isActive: false },
      });
      await this.auditCategory(user, 'CATEGORY_DISABLED', id, { categoryId: id, newValue: updated });
      return updated;
    }

    await this.auditCategory(user, 'CATEGORY_DISABLED', id, { categoryId: id, oldValue: category });
    return this.prisma.productCategory.delete({ where: { id } });
  }

  async suggestProductCode(user: AuthUser, categoryId: string, branchId?: string) {
    this.assertCanManageProductCatalog(user);
    const category = await this.getActiveCategory(this.prisma, categoryId);
    const resolvedBranchId = branchId?.trim() || (await this.resolveHqCatalogBranchId(this.prisma));
    const prefix = resolveCategoryProductCodePrefix(category);
    const usedCodes = await this.collectCategoryProductCodes(this.prisma, category.id, prefix);
    const suggestedCode = nextProductCode(prefix, usedCodes);

    return {
      categoryId: category.id,
      prefix,
      suggestedCode,
      barcode: nextProductBarcode(suggestedCode),
      branchId: resolvedBranchId,
    };
  }

  async validateProductCode(
    user: AuthUser,
    sku: string,
    branchId?: string,
    excludeProductId?: string,
  ) {
    this.assertCanManageProductCatalog(user);
    const normalized = normalizeProductCode(sku);
    if (!isValidProductCode(normalized)) {
      return {
        valid: false,
        normalizedCode: normalized,
        error: 'Product code must be 1-12 uppercase Latin letters or digits without spaces',
      };
    }

    const resolvedBranchId = branchId?.trim() || (await this.resolveHqCatalogBranchId(this.prisma));
    const duplicate = await this.prisma.product.findFirst({
      where: {
        branchId: resolvedBranchId,
        deletedAt: null,
        sku: { equals: normalized, mode: 'insensitive' },
        ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
      },
      select: { id: true, sku: true },
    });

    if (duplicate) {
      return {
        valid: false,
        normalizedCode: normalized,
        error: 'Active product with this product code already exists',
      };
    }

    return {
      valid: true,
      normalizedCode: normalized,
      error: null,
    };
  }

  async createProduct(user: AuthUser, dto: CreateProductDto) {
    try {
      this.assertCanManageProductCatalog(user);
      if (!canEditSellingPrice(user) && Number(dto.sellingPriceKgs ?? 0) !== 0) {
        throw new ForbiddenException(SELLING_PRICE_EDIT_DENIED_MESSAGE);
      }
      return await this.prisma.$transaction(async (tx) => {
        if (!dto.name?.trim()) throw new BadRequestException('Product name is required');
        if (!dto.categoryId) throw new BadRequestException('Category is required');

        let warehouseId = dto.warehouseId?.trim();
        if (!warehouseId) {
          const defaultWarehouse = await tx.warehouse.findFirst({
            where: activeHqWarehouseWhere,
            orderBy: { createdAt: 'asc' },
          });
          if (!defaultWarehouse) {
            throw new BadRequestException('No active HQ warehouse found for product catalog');
          }
          warehouseId = defaultWarehouse.id;
        }

        const warehouse = await this.getWarehouseForCatalogWrite(tx, user, warehouseId);
        let branchId: string;
        if (isHqWarehouse(warehouse)) {
          branchId = dto.branchId?.trim() || (await this.resolveHqCatalogBranchId(tx));
        } else {
          branchId = dto.branchId ?? warehouse.branchId ?? '';
          if (!branchId) {
            throw new BadRequestException('Branch is required');
          }
        }
        assertProductWarehouseBranchMatch(warehouse, branchId);

        const category = await this.getActiveCategory(tx, dto.categoryId);
        this.assertPositiveProductWeight(dto.weightKg);
        const latestRateRow = await tx.yuanRateHistory.findFirst({ orderBy: { effectiveFrom: 'desc' } });
        const yuanRate = dto.latestYuanRate ?? Number(latestRateRow?.rate ?? 0);
        const costs = this.calculateCosts({
          weightKg: dto.weightKg,
          purchasePriceYuan: dto.purchasePriceYuan,
          yuanRate,
          transportCostKgs: 0,
          sellingPriceKgs: dto.sellingPriceKgs ?? 0,
        });
        const existingProduct = dto.sku?.trim()
          ? await tx.product.findFirst({
              where: {
                branchId,
                sku: { equals: normalizeProductCode(dto.sku), mode: 'insensitive' },
              },
              include: this.productInclude(),
            })
          : null;

        if (existingProduct && !existingProduct.deletedAt) {
          throw new ConflictException('Active product with this SKU already exists');
        }

        if (existingProduct?.deletedAt) {
          await tx.product.update({
            where: { id: existingProduct.id },
            data: {
              deletedAt: null,
              isActive: dto.isActive ?? true,
              warehouseId: warehouse.id,
              name: dto.name,
              categoryId: category.id,
              category: category.nameEn,
              photoUrl: dto.photoUrl,
              description: dto.description,
              characteristics: dto.characteristics as Prisma.InputJsonValue,
              unit: dto.unit ?? existingProduct.unit,
              defaultSupplierId: dto.defaultSupplierId,
              defaultFactoryId: dto.defaultFactoryId,
              weightKg: dto.weightKg,
              purchasePriceYuan: dto.purchasePriceYuan,
              latestYuanRate: yuanRate,
              ...costs,
              minStockLevel: 0,
              barcode: dto.barcode?.trim() || null,
              priceHistory: {
                create: {
                  purchasePriceYuan: dto.purchasePriceYuan,
                  yuanRate,
                  ...costs,
                  effectiveFrom: new Date(),
                  createdById: user.id,
                },
              },
            },
          });

          return {
            ...(await this.getProductResponseInTx(tx, user, existingProduct.id)),
            restored: true,
          };
        }

        const prefix = resolveCategoryProductCodePrefix(category);
        const usedCodes = await this.collectCategoryProductCodes(tx, category.id, prefix);
        const requestedSku = dto.sku?.trim() ? normalizeProductCode(dto.sku) : '';
        let generatedSku: string;
        if (requestedSku) {
          if (!isValidProductCode(requestedSku)) {
            throw new BadRequestException(
              'Product code must be 1-12 uppercase Latin letters or digits without spaces',
            );
          }
          await this.ensureSkuAvailable(tx, branchId, requestedSku);
          generatedSku = requestedSku;
        } else {
          generatedSku = nextProductCode(prefix, usedCodes);
        }
        const generatedBarcode = dto.barcode?.trim()
          ? normalizeProductCode(dto.barcode)
          : nextProductBarcode(generatedSku);
        if (dto.barcode?.trim() && !isValidProductCode(generatedBarcode)) {
          throw new BadRequestException(
            'Barcode must be 1-12 uppercase Latin letters or digits without spaces',
          );
        }

        const product = await tx.product.create({
          data: {
            branchId,
            warehouseId: warehouse.id,
            name: dto.name,
            sku: generatedSku,
            barcode: generatedBarcode,
            categoryId: category.id,
            category: category.nameEn,
            photoUrl: dto.photoUrl,
            description: dto.description,
            characteristics: dto.characteristics as Prisma.InputJsonValue,
            unit: dto.unit ?? 'pcs',
            defaultSupplierId: dto.defaultSupplierId,
            defaultFactoryId: dto.defaultFactoryId,
            weightKg: dto.weightKg,
            purchasePriceYuan: dto.purchasePriceYuan,
            latestYuanRate: yuanRate,
            ...costs,
            minStockLevel: 0,
            isActive: dto.isActive ?? true,
            priceHistory: {
              create: {
                purchasePriceYuan: dto.purchasePriceYuan,
                yuanRate,
                ...costs,
                effectiveFrom: new Date(),
                createdById: user.id,
              },
            },
          },
          include: this.productInclude(),
        });

        await this.auditInTx(tx, user, branchId, 'PRODUCT_CREATED', 'Product', product.id, {
          module: 'inventory',
          sku: product.sku,
          newValue: { name: product.name, sku: product.sku, weightKg: Number(product.weightKg) },
        });
        await this.auditInTx(tx, user, branchId, 'PRODUCT_CODE_GENERATED', 'Product', product.id, {
          userId: user.id,
          categoryId: category.id,
          productId: product.id,
          prefix,
          generatedCode: product.sku,
          timestamp: new Date().toISOString(),
        });
        await this.auditInTx(tx, user, branchId, 'PRODUCT_CREATE_FORM_UPDATED', 'Product', product.id, {
          catalogOnly: true,
          fields: ['name', 'sku', 'barcode', 'category', 'unit', 'weight', 'supplier', 'factory', 'purchasePriceYuan', 'image', 'status'],
        });

        return {
          ...(await this.getProductResponseInTx(tx, user, product.id)),
          restored: false,
        };
      });
    } catch (error) {
      this.logProductCreateFailure(user, dto, error);
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Active product with this SKU already exists');
      }
      throw error;
    }
  }

  async products(user: AuthUser, query: ProductQueryDto) {
    this.assertCanViewProductCatalog(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...this.buildProductCatalogWhere(user, query.branchId),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { productCategory: { nameKy: { contains: search, mode: 'insensitive' } } },
        { productCategory: { nameRu: { contains: search, mode: 'insensitive' } } },
        { productCategory: { nameEn: { contains: search, mode: 'insensitive' } } },
        { codeMigrations: { some: { oldCode: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: this.productInclude(),
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    // Shared HQ FIFO unit-cost resolver — sync once for the page, never per-row sync.
    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();

    return {
      items: await Promise.all(items.map((product) => this.toProductResponseWithFifoCost(product, user))),
      total,
      page,
      pageSize,
    };
  }

  async product(user: AuthUser, id: string) {
    this.assertCanViewProductCatalog(user);
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.buildProductCatalogWhere(user),
      },
      include: {
        ...this.productInclude(),
        priceHistory: {
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { effectiveFrom: 'desc' },
        },
        purchasePriceHistory: {
          include: {
            supplier: { select: { id: true, name: true } },
            factory: { select: { id: true, name: true } },
            changedBy: { select: { id: true, fullName: true, role: true } },
            procurementOrder: { select: { id: true, orderNumber: true } },
          },
          orderBy: { effectiveDate: 'desc' },
          take: 20,
        },
        stockMovements: {
          include: {
            warehouse: true,
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();
    return this.toProductResponseWithFifoCost(product, user);
  }

  async updateProduct(user: AuthUser, id: string, dto: UpdateProductDto) {
    this.assertCanManageProductCatalog(user);
    if (dto.unit !== undefined) {
      if (!canEditProductUnit(user)) {
        throw new ForbiddenException('You do not have permission to edit product unit of measure');
      }
      if (!dto.unit.trim()) {
        throw new BadRequestException('Unit of measure is required');
      }
    }
    if (dto.sellingPriceKgs !== undefined && !canEditSellingPrice(user)) {
      const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
      await this.auditProductAccessDenied(user, id, product?.branchId ?? null, 'PRODUCT_PRICE_EDIT_DENIED', {
        productId: id,
        oldValue: product ? { sellingPriceKgs: Number(product.sellingPriceKgs) } : null,
        newValue: { sellingPriceKgs: dto.sellingPriceKgs },
      });
      throw new ForbiddenException(SELLING_PRICE_EDIT_DENIED_MESSAGE);
    }

    const maxAttempts = dto.categoryId !== undefined ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
      const current = await this.getProductForWrite(tx, user, id);
      const categoryChanged =
        dto.categoryId !== undefined && dto.categoryId !== current.categoryId;

      if (
        !categoryChanged &&
        dto.sku &&
        normalizeProductCode(dto.sku) !== normalizeProductCode(current.sku)
      ) {
        const normalizedSku = normalizeProductCode(dto.sku);
        if (!isValidProductCode(normalizedSku)) {
          throw new BadRequestException(
            'Product code must be 1-12 uppercase Latin letters or digits without spaces',
          );
        }
        await this.ensureSkuAvailable(tx, current.branchId, normalizedSku, current.id);
      }

      if (dto.warehouseId) {
        const warehouse = await this.getWarehouseForCatalogWrite(tx, user, dto.warehouseId);
        assertProductWarehouseBranchMatch(warehouse, current.branchId);
      }

      const oldWarehouseId = current.warehouseId;
      const warehouseChanged =
        dto.warehouseId !== undefined && dto.warehouseId !== oldWarehouseId;

      let category = dto.categoryId
        ? categoryChanged
          ? await this.getActiveCategoryForProductCategoryChange(tx, dto.categoryId)
          : await this.getActiveCategory(tx, dto.categoryId)
        : null;

      let regeneratedSku: string | undefined;
      let regeneratedBarcode: string | undefined;
      if (categoryChanged && category) {
        const prefix = resolveCategoryProductCodePrefix(category);
        if (!isValidCategoryCodePrefix(prefix)) {
          throw new BadRequestException('Для выбранной категории не настроен префикс кода');
        }
        regeneratedSku = await this.allocateNextProductCode(
          tx,
          current.branchId,
          category.id,
          prefix,
          current.id,
        );
        regeneratedBarcode = nextProductBarcode(regeneratedSku);
      }

      const oldWeightKg = Number(current.weightKg);
      if (dto.weightKg !== undefined) {
        this.assertPositiveProductWeight(dto.weightKg);
      }
      const weightChanged =
        dto.weightKg !== undefined && Number(dto.weightKg) !== oldWeightKg;
      const oldUnit = current.unit;
      const nextUnit = dto.unit !== undefined ? dto.unit.trim() : oldUnit;
      const unitChanged = dto.unit !== undefined && nextUnit !== oldUnit;

      let purchasePriceYuan = Number(current.purchasePriceYuan);
      if (dto.purchasePriceYuan !== undefined) {
        const requestedPrice = Number(dto.purchasePriceYuan);
        if (requestedPrice !== purchasePriceYuan) {
          this.assertCanEditPurchasePriceYuan(user);
          await this.recordPurchasePriceChangeInTx(tx, user, {
            productId: id,
            newPriceYuan: requestedPrice,
            reason: dto.purchasePriceChangeReason ?? PurchasePriceChangeReason.MANUAL_CORRECTION,
            supplierId: dto.defaultSupplierId ?? current.defaultSupplierId,
            factoryId: dto.defaultFactoryId ?? current.defaultFactoryId,
            note: dto.purchasePriceChangeNote,
          });
          purchasePriceYuan = requestedPrice;
        }
      }

      const refreshed = await tx.product.findFirst({ where: { id } });
      const currentAfterPrice = refreshed ?? current;

      const next = {
        weightKg: dto.weightKg ?? Number(currentAfterPrice.weightKg),
        purchasePriceYuan,
        latestYuanRate: dto.latestYuanRate ?? Number(currentAfterPrice.latestYuanRate),
        transportCostKgs:
          dto.transportCostKgs ??
          (dto.transportCostPerKg !== undefined || dto.weightKg !== undefined
            ? (dto.weightKg ?? Number(currentAfterPrice.weightKg)) *
              Number(dto.transportCostPerKg ?? 0)
            : Number(currentAfterPrice.transportCostKgs)),
        sellingPriceKgs:
          dto.sellingPriceKgs ?? Number(currentAfterPrice.sellingPriceKgs),
      };
      const costs = this.calculateCosts({
        weightKg: next.weightKg,
        purchasePriceYuan: next.purchasePriceYuan,
        yuanRate: next.latestYuanRate,
        transportCostKgs: next.transportCostKgs,
        sellingPriceKgs: next.sellingPriceKgs,
      });
      const priceChanged =
        dto.latestYuanRate !== undefined ||
        dto.transportCostKgs !== undefined ||
        dto.transportCostPerKg !== undefined ||
        dto.weightKg !== undefined ||
        dto.sellingPriceKgs !== undefined ||
        (dto.purchasePriceYuan !== undefined &&
          Number(dto.purchasePriceYuan) !== Number(current.purchasePriceYuan));

      const oldCategoryId = current.categoryId;
      const oldProductCode = current.sku;
      const nextSku = categoryChanged
        ? regeneratedSku
        : dto.sku !== undefined
          ? normalizeProductCode(dto.sku)
          : undefined;

      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          sku: nextSku,
          barcode: categoryChanged ? regeneratedBarcode : undefined,
          categoryId: category?.id,
          category: category?.nameEn,
          warehouseId: dto.warehouseId,
          photoUrl: dto.photoUrl,
          description: dto.description,
          characteristics: dto.characteristics as Prisma.InputJsonValue,
          unit: dto.unit !== undefined ? nextUnit : undefined,
          defaultSupplierId: dto.defaultSupplierId,
          defaultFactoryId: dto.defaultFactoryId,
          weightKg: next.weightKg,
          purchasePriceYuan: next.purchasePriceYuan,
          purchasePriceUpdatedAt:
            dto.purchasePriceYuan !== undefined &&
            Number(dto.purchasePriceYuan) !== Number(current.purchasePriceYuan)
              ? new Date()
              : currentAfterPrice.purchasePriceUpdatedAt,
          latestYuanRate: next.latestYuanRate,
          ...costs,
          minStockLevel: dto.minStockLevel,
          isActive: dto.isActive,
          priceHistory: priceChanged
            ? {
                create: {
                  purchasePriceYuan: next.purchasePriceYuan,
                  yuanRate: next.latestYuanRate,
                  ...costs,
                  effectiveFrom: new Date(),
                  createdById: user.id,
                },
              }
            : undefined,
        },
      });

      if (categoryChanged && category && regeneratedSku) {
        await tx.productCodeMigration.create({
          data: {
            productId: id,
            oldCode: oldProductCode,
            newCode: regeneratedSku,
            migrationName: CATEGORY_CHANGE_MIGRATION_NAME,
          },
        });
        await this.auditInTx(
          tx,
          user,
          current.branchId,
          'PRODUCT_CATEGORY_CHANGED_AND_CODE_REGENERATED',
          'Product',
          id,
          {
            productId: id,
            oldCategoryId,
            newCategoryId: category.id,
            oldProductCode,
            newProductCode: regeneratedSku,
            changedById: user.id,
            changedAt: new Date().toISOString(),
            oldValue: {
              categoryId: oldCategoryId,
              sku: oldProductCode,
            },
            newValue: {
              categoryId: category.id,
              sku: regeneratedSku,
            },
          },
        );
      }

      await this.auditInTx(tx, user, current.branchId, 'PRODUCT_UPDATED', 'Product', id, {
        module: 'inventory',
        sku: nextSku ?? current.sku,
        productId: id,
        oldValue: { name: current.name, sku: current.sku, sellingPriceKgs: Number(current.sellingPriceKgs) },
        newValue: {
          name: dto.name ?? current.name,
          sku: nextSku ?? current.sku,
          sellingPriceKgs: next.sellingPriceKgs,
        },
      });

      if (
        dto.sellingPriceKgs !== undefined &&
        canEditSellingPrice(user) &&
        Number(dto.sellingPriceKgs) !== Number(current.sellingPriceKgs)
      ) {
        await this.auditInTx(tx, user, current.branchId, 'PRODUCT_PRICE_UPDATED', 'Product', id, {
          productId: id,
          oldValue: { sellingPriceKgs: Number(current.sellingPriceKgs) },
          newValue: { sellingPriceKgs: Number(dto.sellingPriceKgs) },
        });
      }

      if (weightChanged && dto.weightKg !== undefined) {
        await this.auditInTx(tx, user, current.branchId, 'PRODUCT_WEIGHT_CHANGED', 'Product', id, {
          entityType: 'Product',
          productId: id,
          oldWeight: oldWeightKg,
          newWeight: dto.weightKg,
          oldValue: { weightKg: oldWeightKg },
          newValue: { weightKg: dto.weightKg },
          reason: dto.weightChangeReason,
        });
        await this.syncProductWeightToOpenProcurementOrders(tx, id, dto.weightKg);
      }

      if (warehouseChanged && dto.warehouseId) {
        await this.auditInTx(tx, user, current.branchId, 'PRODUCT_WAREHOUSE_CHANGED', 'Product', id, {
          entityType: 'Product',
          productId: id,
          oldWarehouseId,
          newWarehouseId: dto.warehouseId,
          oldValue: { warehouseId: oldWarehouseId },
          newValue: { warehouseId: dto.warehouseId },
        });
      }

      if (unitChanged) {
        await this.auditInTx(tx, user, current.branchId, 'PRODUCT_UNIT_UPDATED', 'Product', id, {
          userId: user.id,
          role: user.role,
          productId: id,
          oldUnit,
          newUnit: nextUnit,
          timestamp: new Date().toISOString(),
        });
      }

      return this.getProductResponseInTx(tx, user, id);
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error) && attempt < maxAttempts - 1) {
          lastError = error;
          continue;
        }
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('Не удалось сформировать уникальный код товара');
        }
        throw error;
      }
    }

    throw lastError ?? new ConflictException('Не удалось сформировать уникальный код товара');
  }

  async deleteProduct(user: AuthUser, id: string) {
    if (!canArchiveProduct(user)) {
      const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
      await this.auditProductAccessDenied(user, id, product?.branchId ?? null, 'PRODUCT_DELETE_DENIED', {
        productId: id,
        oldValue: product ? { name: product.name, sku: product.sku, isActive: product.isActive } : null,
        newValue: null,
      });
      throw new ForbiddenException('You do not have permission to archive products');
    }
    const product = await this.getProductForWrite(this.prisma, user, id);
    const [stockMovements, saleItems, balances, priceHistory] =
      await Promise.all([
        this.prisma.stockMovement.count({ where: { productId: id } }),
        this.prisma.saleItem.count({ where: { productId: id } }),
        this.prisma.inventoryBalance.count({ where: { productId: id } }),
        this.prisma.productPriceHistory.count({ where: { productId: id } }),
      ]);
    const hasHistory =
      stockMovements > 0 || saleItems > 0 || balances > 0 || priceHistory > 0;

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditInTx(this.prisma, user, product.branchId, 'PRODUCT_ARCHIVED', 'Product', id, {
      module: 'inventory',
      entityType: 'Product',
      sku: product.sku,
      oldValue: { name: product.name, sku: product.sku, isActive: product.isActive },
      newValue: { isActive: false, deletedAt: new Date().toISOString() },
    });

    return {
      success: true,
      message: hasHistory
        ? 'Product was deactivated because it has sales or stock history.'
        : 'Product deleted successfully',
      deactivated: hasHistory,
    };
  }

  async addPriceHistory(
    user: AuthUser,
    productId: string,
    dto: CreatePriceHistoryDto,
  ) {
    this.assertCanManageProductCatalog(user);
    if (!canEditSellingPrice(user)) {
      const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (
        Number(dto.sellingPriceKgs) !== Number(product?.sellingPriceKgs ?? 0)
      ) {
        await this.auditProductAccessDenied(user, productId, product?.branchId ?? null, 'PRODUCT_PRICE_EDIT_DENIED', {
          productId,
          oldValue: product ? { sellingPriceKgs: Number(product.sellingPriceKgs) } : null,
          newValue: { sellingPriceKgs: dto.sellingPriceKgs },
        });
        throw new ForbiddenException(SELLING_PRICE_EDIT_DENIED_MESSAGE);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const product = await this.getProductForWrite(tx, user, productId);
      if (
        Number(dto.purchasePriceYuan) !== Number(product.purchasePriceYuan)
      ) {
        this.assertCanEditPurchasePriceYuan(user);
      }
      const transportCostKgs =
        dto.transportCostKgs ??
        Number(product.weightKg) * Number(dto.transportCostPerKg ?? 0);
      const costs = this.calculateCosts({
        weightKg: Number(product.weightKg),
        purchasePriceYuan: dto.purchasePriceYuan,
        yuanRate: dto.yuanRate,
        transportCostKgs,
        sellingPriceKgs: dto.sellingPriceKgs,
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          purchasePriceYuan: dto.purchasePriceYuan,
          latestYuanRate: dto.yuanRate,
          ...costs,
          sellingPriceKgs: dto.sellingPriceKgs,
        },
      });

      return tx.productPriceHistory.create({
        data: {
          productId,
          purchasePriceYuan: dto.purchasePriceYuan,
          yuanRate: dto.yuanRate,
          ...costs,
          effectiveFrom: dto.effectiveFrom ?? new Date(),
          createdById: user.id,
        },
      });
    });
  }

  async priceHistory(user: AuthUser, productId: string) {
    this.assertCanViewProductCost(user);
    await this.getProductForRead(user, productId);
    return this.prisma.productPriceHistory.findMany({
      where: { productId },
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async purchasePriceHistoryForProduct(user: AuthUser, productId: string) {
    this.assertCanViewProductCost(user);
    await this.getProductForRead(user, productId);
    return this.queryPurchasePriceHistory({ productId });
  }

  async purchasePriceHistoryReport(
    user: AuthUser,
    query: PurchasePriceHistoryQueryDto,
  ) {
    this.assertCanViewProductCost(user);
    if (!canViewProductCatalog(user) && !this.canAccessAllInventory(user)) {
      throw new ForbiddenException('You do not have permission to view purchase price history');
    }
    return this.queryPurchasePriceHistory(query);
  }

  async updatePurchasePriceYuan(
    user: AuthUser,
    productId: string,
    dto: UpdatePurchasePriceDto,
  ) {
    this.assertCanEditPurchasePriceYuan(user);
    return this.prisma.$transaction(async (tx) => {
      const product = await this.getProductForWrite(tx, user, productId);
      await this.recordPurchasePriceChangeInTx(tx, user, {
        productId,
        newPriceYuan: dto.purchasePriceYuan,
        reason: dto.reason,
        supplierId: product.defaultSupplierId,
        factoryId: product.defaultFactoryId,
        note: dto.note,
      });
      return this.getProductResponseInTx(tx, user, productId);
    });
  }

  async syncProcurementPurchasePricesInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      orderId: string;
      items: Array<{
        productId: string;
        purchasePriceYuan: number;
        supplierId?: string | null;
        factoryId?: string | null;
      }>;
    },
  ) {
    for (const item of input.items) {
      await this.recordPurchasePriceChangeInTx(tx, user, {
        productId: item.productId,
        newPriceYuan: item.purchasePriceYuan,
        reason: PurchasePriceChangeReason.NEW_PROCUREMENT,
        supplierId: item.supplierId,
        factoryId: item.factoryId,
        procurementOrderId: input.orderId,
      });
    }
  }

  async recordPurchasePriceChangeInTx(
    tx: PrismaTx,
    user: AuthUser,
    input: {
      productId: string;
      newPriceYuan: number;
      reason: PurchasePriceChangeReason;
      supplierId?: string | null;
      factoryId?: string | null;
      procurementOrderId?: string | null;
      note?: string | null;
      effectiveDate?: Date;
    },
  ) {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const oldPriceYuan = this.roundMoney(Number(product.purchasePriceYuan));
    const newPriceYuan = this.roundMoney(input.newPriceYuan);
    if (oldPriceYuan === newPriceYuan) {
      return { changed: false, oldPriceYuan, newPriceYuan };
    }

    const differenceYuan = this.roundMoney(newPriceYuan - oldPriceYuan);
    const effectiveDate = input.effectiveDate ?? new Date();
    const costs = this.calculateCosts({
      weightKg: Number(product.weightKg),
      purchasePriceYuan: newPriceYuan,
      yuanRate: Number(product.latestYuanRate),
      transportCostKgs: Number(product.transportCostKgs),
      sellingPriceKgs: Number(product.sellingPriceKgs),
    });

    await tx.product.update({
      where: { id: input.productId },
      data: {
        purchasePriceYuan: newPriceYuan,
        purchasePriceUpdatedAt: effectiveDate,
        ...costs,
      },
    });

    await tx.productPurchasePriceHistory.create({
      data: {
        productId: input.productId,
        supplierId: input.supplierId ?? product.defaultSupplierId,
        factoryId: input.factoryId ?? product.defaultFactoryId,
        oldPriceYuan,
        newPriceYuan,
        differenceYuan,
        effectiveDate,
        reason: input.reason,
        note: input.note,
        procurementOrderId: input.procurementOrderId,
        changedById: user.id,
      },
    });

    await this.auditInTx(
      tx,
      user,
      product.branchId,
      'PURCHASE_PRICE_CHANGED',
      'Product',
      input.productId,
      {
        productId: input.productId,
        oldPrice: oldPriceYuan,
        newPrice: newPriceYuan,
        reason: input.reason,
        supplierId: input.supplierId ?? product.defaultSupplierId,
        factoryId: input.factoryId ?? product.defaultFactoryId,
        procurementOrderId: input.procurementOrderId,
        note: input.note,
      },
    );

    return { changed: true, oldPriceYuan, newPriceYuan };
  }

  private async queryPurchasePriceHistory(query: PurchasePriceHistoryQueryDto) {
    const where: Prisma.ProductPurchasePriceHistoryWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.factoryId) where.factoryId = query.factoryId;
    if (query.changedById) where.changedById = query.changedById;
    if (query.from || query.to) {
      where.effectiveDate = {};
      if (query.from) where.effectiveDate.gte = new Date(query.from);
      if (query.to) where.effectiveDate.lte = new Date(query.to);
    }

    const rows = await this.prisma.productPurchasePriceHistory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true } },
        changedBy: { select: { id: true, fullName: true, role: true } },
        procurementOrder: { select: { id: true, orderNumber: true } },
      },
      orderBy: { effectiveDate: 'desc' },
      take: 500,
    });

    return rows.map((row) => ({
      ...row,
      oldPriceYuan: Number(row.oldPriceYuan),
      newPriceYuan: Number(row.newPriceYuan),
      differenceYuan: Number(row.differenceYuan),
    }));
  }

  createYuanRate(user: AuthUser, dto: CreateYuanRateDto) {
    if (this.isBranchInventoryUser(user)) {
      void this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'YUAN_RATE_ACTION_REMOVED',
          entity: 'YuanRateHistory',
          metadata: {
            userId: user.id,
            role: user.role,
            branchId: user.branchId,
            reason: 'Branch users cannot manage yuan exchange rates',
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      void this.auditBranchDataAccessDenied(user, user.branchId ?? undefined, 'Yuan rate management is not allowed for branch users');
      throw new ForbiddenException('Branch users cannot manage yuan exchange rates');
    }
    return this.prisma.yuanRateHistory.create({
      data: {
        rate: dto.rate,
        effectiveFrom: dto.effectiveFrom ?? new Date(),
        createdById: user.id,
      },
    });
  }

  yuanRates() {
    return this.prisma.yuanRateHistory.findMany({
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  latestYuanRate() {
    return this.prisma.yuanRateHistory.findFirst({
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async createWarehouse(user: AuthUser, dto: CreateWarehouseDto) {
    const branchId = this.resolveBranchId(user, dto.branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    return this.prisma.warehouse.create({
      data: {
        branchId,
        warehouseType: WarehouseType.BRANCH,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        isActive: dto.isActive ?? true,
      },
    }).then(async (warehouse) => {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'WAREHOUSE_CREATED',
          entity: 'Warehouse',
          entityId: warehouse.id,
          metadata: {
            userId: user.id,
            roles: user.roles ?? [user.role],
            warehouseId: warehouse.id,
            warehouseType: WarehouseType.BRANCH,
            newValue: warehouse,
            timestamp: new Date().toISOString(),
          },
        },
      });
      return warehouse;
    });
  }

  warehouses(user: AuthUser, branchId?: string, warehouseType?: string, status?: string) {
    const activeOnly = status?.toUpperCase() === 'ACTIVE';
    const branchScope = this.buildBranchWhere(user, branchId);

    if (isBranchWarehouseOperator(user)) {
      if (!user.branchId) {
        throw new BadRequestException('Branch is required');
      }
      return this.prisma.warehouse.findMany({
        where: {
          ...activeBranchWarehouseWhere,
          branchId: user.branchId,
        },
        orderBy: { name: 'asc' },
      });
    }

    const typeWhere: Prisma.WarehouseWhereInput =
      warehouseType === 'HQ'
        ? activeOnly
          ? activeHqWarehouseWhere
          : hqWarehouseWhere
        : warehouseType === 'BRANCH'
          ? activeOnly
            ? activeBranchWarehouseWhere
            : branchWarehouseWhere
          : { deletedAt: null };

    const where: Prisma.WarehouseWhereInput = {
      ...typeWhere,
      ...branchScope,
      ...(branchScope.branchId ? { branchId: branchScope.branchId } : {}),
    };

    if (activeOnly && !warehouseType) {
      where.isActive = true;
      where.deletedAt = null;
    }

    return this.prisma.warehouse.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async warehouse(user: AuthUser, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }) },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  async updateWarehouse(user: AuthUser, id: string, dto: UpdateWarehouseDto) {
    await this.getWarehouseForWrite(this.prisma, user, id);
    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  createStockMovement(user: AuthUser, dto: CreateStockMovementDto) {
    if (!canBranchSalesManagerModifyStock(user)) {
      throw new ForbiddenException('Branch Sales Manager cannot change warehouse stock');
    }
    return this.prisma.$transaction((tx) =>
      this.createStockMovementInTx(tx, user, dto),
    );
  }

  stockMovements(user: AuthUser, query: StockMovementQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      status: StockMovementStatus.ACTIVE,
      ...this.buildBranchWhere(user, query.branchId),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    return this.prisma.stockMovement.findMany({
      where,
      include: {
        product: true,
        warehouse: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async balances(user: AuthUser, query: ProductQueryDto) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        ...this.buildInventoryBalanceWhere(user, query.branchId),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
    });

    return balances.map((balance) => this.toBalanceResponse(balance, user));
  }

  async stockValue(user: AuthUser, branchId?: string) {
    this.assertCanViewProductCost(user);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: this.buildInventoryBalanceWhere(user, branchId),
      include: { product: { include: { productCategory: true } }, warehouse: true },
    });
    const totalQuantity = balances.reduce((sum, item) => sum + item.quantity, 0);
    const totalStockValueKgs = balances.reduce(
      (sum, item) => sum + Number(item.totalValueKgs),
      0,
    );
    const byWarehouse = this.groupStockValue(
      balances,
      (item) => item.warehouse.name,
    );
    const byCategory = this.groupStockValue(
      balances,
      (item) => item.product.productCategory?.nameEn ?? item.product.category,
    );

    return {
      totalQuantity,
      totalStockValueKgs: this.roundMoney(totalStockValueKgs),
      byWarehouse,
      byCategory,
    };
  }

  async lowStock(user: AuthUser, branchId?: string) {
    const balances = await this.balances(user, { branchId });
    return balances.filter((balance) => balance.lowStock);
  }

  /**
   * Single source of truth for warehouse available quantity (quantity - reservedQuantity).
   * Resolves branch-local product IDs to HQ warehouse products by SKU when needed.
   */
  async getAvailableQuantity(
    user: AuthUser | null,
    warehouseId: string,
    productId: string,
    options?: {
      sku?: string;
      branchId?: string;
      skipAccessCheck?: boolean;
    },
  ): Promise<number> {
    const map = await this.getAvailableQuantityMap(
      user,
      warehouseId,
      [{ productId, sku: options?.sku }],
      { branchId: options?.branchId, skipAccessCheck: options?.skipAccessCheck },
    );
    return map.get(productId) ?? 0;
  }

  /**
   * Resolves the inventory balance product for a warehouse.
   * Branch catalog products are mapped to their HQ catalog counterpart by SKU when
   * stock is held in an HQ warehouse.
   */
  async resolveWarehouseInventoryProductInTx(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    productId: string,
    sku?: string | null,
  ): Promise<{ productId: string; branchId: string }> {
    const [warehouse, product] = await Promise.all([
      tx.warehouse.findFirst({
        where: { id: warehouseId, deletedAt: null },
        select: { id: true, warehouseType: true, branchId: true },
      }),
      tx.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true, sku: true, branchId: true, warehouseId: true },
      }),
    ]);
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.warehouseId === warehouseId) {
      return { productId: product.id, branchId: product.branchId };
    }

    const normalizedSku = (sku ?? product.sku)?.trim();
    if (isHqWarehouse(warehouse) && normalizedSku) {
      const hqBranch = await ensureHqCatalogBranch(tx);
      const hqProduct = await tx.product.findFirst({
        where: {
          branchId: hqBranch.id,
          sku: normalizedSku,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, branchId: true },
      });
      if (hqProduct) {
        return { productId: hqProduct.id, branchId: hqProduct.branchId };
      }
    }

    return {
      productId: product.id,
      branchId: inventoryBranchIdForWarehouse(warehouse, product.branchId),
    };
  }

  /**
   * Resolves HQ catalog productId to a branch warehouse product for receiving.
   * Creates the branch product automatically when it does not exist yet.
   */
  async ensureBranchWarehouseProductInTx(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      warehouseId: string;
      catalogProductId: string;
      sku: string;
      productName?: string;
      unitCostKgs?: number;
    },
  ): Promise<{ productId: string; branchId: string; created: boolean }> {
    const resolved = await ensureBranchProductForReceivingInTx(tx, {
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      productId: params.catalogProductId,
      sku: params.sku,
      productName: params.productName,
      unitCostKgs: params.unitCostKgs,
    });
    return {
      productId: resolved.productId,
      branchId: resolved.branchId,
      created: resolved.created,
    };
  }

  async getAvailableQuantityMap(
    user: AuthUser | null,
    warehouseId: string,
    items: Array<{ productId: string; sku?: string }>,
    options?: { branchId?: string; skipAccessCheck?: boolean },
  ): Promise<Map<string, number>> {
    if (!items.length) {
      return new Map();
    }

    if (!options?.skipAccessCheck) {
      await this.assertHqWarehouseStockAccess(user, warehouseId, options?.branchId);
    }

    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, warehouseId: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const resolvedProductIdBySource = new Map<string, string>();
    const skusToResolve = new Set<string>();

    for (const item of items) {
      const product = productById.get(item.productId);
      const sku = (item.sku ?? product?.sku)?.trim();
      if (product?.warehouseId === warehouseId) {
        resolvedProductIdBySource.set(item.productId, item.productId);
        continue;
      }
      if (sku) {
        skusToResolve.add(sku);
        resolvedProductIdBySource.set(item.productId, item.productId);
      } else {
        resolvedProductIdBySource.set(item.productId, item.productId);
      }
    }

    const hqProductsBySku = new Map<string, string>();
    if (skusToResolve.size) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, deletedAt: null },
        select: { warehouseType: true, branchId: true },
      });
      const productWhere: Prisma.ProductWhereInput = {
        sku: { in: Array.from(skusToResolve) },
        deletedAt: null,
        isActive: true,
        ...(warehouse && isHqWarehouse(warehouse)
          ? { branch: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null } }
          : { warehouseId }),
      };
      const hqProducts = await this.prisma.product.findMany({
        where: productWhere,
        select: { id: true, sku: true },
      });
      for (const hqProduct of hqProducts) {
        hqProductsBySku.set(hqProduct.sku, hqProduct.id);
      }
    }

    for (const item of items) {
      const product = productById.get(item.productId);
      if (product?.warehouseId === warehouseId) {
        continue;
      }
      const sku = (item.sku ?? product?.sku)?.trim();
      const hqProductId = sku ? hqProductsBySku.get(sku) : undefined;
      if (hqProductId) {
        resolvedProductIdBySource.set(item.productId, hqProductId);
      }
    }

    const resolvedIds = Array.from(new Set(resolvedProductIdBySource.values()));
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId, productId: { in: resolvedIds } },
      select: { productId: true, quantity: true, reservedQuantity: true },
    });
    const availableByProductId = new Map(
      balances.map((balance) => [
        balance.productId,
        Math.max(balance.quantity - (balance.reservedQuantity ?? 0), 0),
      ]),
    );

    const result = new Map<string, number>();
    for (const item of items) {
      const resolvedId = resolvedProductIdBySource.get(item.productId) ?? item.productId;
      result.set(item.productId, availableByProductId.get(resolvedId) ?? 0);
    }

    if (user && this.isHqSalesManagerScoped(user)) {
      await this.auditHqStockLookup(user, warehouseId, options?.branchId, items, result);
    }

    return result;
  }

  async getHqWarehouseStockMetricsMap(
    warehouseId: string,
    items: Array<{ productId: string; sku?: string }>,
  ): Promise<
    Map<
      string,
      {
        resolvedProductId: string;
        physicalQuantity: number;
        generalAvailableQuantity: number;
        totalActiveBookedQuantity: number;
      }
    >
  > {
    if (!items.length) {
      return new Map();
    }

    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, warehouseId: true, branchId: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const resolvedProductIdBySource = new Map<string, string>();

    for (const item of items) {
      const product = productById.get(item.productId);
      const sku = (item.sku ?? product?.sku)?.trim();
      if (product?.warehouseId === warehouseId) {
        resolvedProductIdBySource.set(item.productId, item.productId);
        continue;
      }
      if (sku) {
        const hqBranch = await ensureHqCatalogBranch(this.prisma);
        const catalogProduct = await this.prisma.product.findFirst({
          where: {
            branchId: hqBranch.id,
            sku,
            deletedAt: null,
            isActive: true,
          },
          select: { id: true },
        });
        resolvedProductIdBySource.set(item.productId, catalogProduct?.id ?? item.productId);
      } else {
        resolvedProductIdBySource.set(item.productId, item.productId);
      }
    }

    const resolvedIds = Array.from(new Set(resolvedProductIdBySource.values()));
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId, productId: { in: resolvedIds } },
      select: { productId: true, quantity: true, reservedQuantity: true },
    });
    const balanceByProductId = new Map(
      balances.map((balance) => [
        balance.productId,
        {
          physicalQuantity: balance.quantity,
          generalAvailableQuantity: Math.max(balance.quantity - (balance.reservedQuantity ?? 0), 0),
          totalActiveBookedQuantity: balance.reservedQuantity ?? 0,
        },
      ]),
    );

    const result = new Map<
      string,
      {
        resolvedProductId: string;
        physicalQuantity: number;
        generalAvailableQuantity: number;
        totalActiveBookedQuantity: number;
      }
    >();
    for (const item of items) {
      const resolvedId = resolvedProductIdBySource.get(item.productId) ?? item.productId;
      const metrics = balanceByProductId.get(resolvedId);
      result.set(item.productId, {
        resolvedProductId: resolvedId,
        physicalQuantity: metrics?.physicalQuantity ?? 0,
        generalAvailableQuantity: metrics?.generalAvailableQuantity ?? 0,
        totalActiveBookedQuantity: metrics?.totalActiveBookedQuantity ?? 0,
      });
    }
    return result;
  }

  async createStockMovementInTx(
    tx: PrismaTx,
    user: AuthUser,
    dto: CreateStockMovementDto,
    options?: {
      branchReceiving?: boolean;
      branchId?: string;
    },
  ) {
    const product =
      options?.branchReceiving && options.branchId
        ? await tx.product.findFirst({
            where: {
              id: dto.productId,
              branchId: options.branchId,
              deletedAt: null,
            },
          })
        : await this.getProductForWrite(tx, user, dto.productId);

    if (!product) {
      throw new NotFoundException(
        `Referenced product was not found. Product ID: ${dto.productId}`,
      );
    }

    const warehouse =
      options?.branchReceiving && options.branchId
        ? await tx.warehouse.findFirst({
            where: {
              id: dto.warehouseId,
              branchId: options.branchId,
              deletedAt: null,
              warehouseType: WarehouseType.BRANCH,
              isActive: true,
            },
          })
        : await this.getWarehouseForWrite(tx, user, dto.warehouseId);

    if (!warehouse) {
      throw new BadRequestException('Branch warehouse is not configured');
    }

    assertProductWarehouseBranchMatch(warehouse, product.branchId);

    const quantityDelta = this.getQuantityDelta(dto.type, dto.quantity);
    const current = await tx.inventoryBalance.findUnique({
      where: {
        branchId_warehouseId_productId: {
          branchId: product.branchId,
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
    });
    const currentQuantity = current?.quantity ?? 0;
    const nextQuantity = currentQuantity + quantityDelta;

    if (nextQuantity < 0 && !(hasAnyFullAccessRole(user.roles?.length ? user.roles : [user.role]) && dto.type === StockMovementType.ADJUSTMENT)) {
      throw new BadRequestException('Negative stock is not allowed');
    }

    const quantityAbs = Math.abs(dto.quantity);
    let totalCostKgs: number;
    let unitCostKgs: number;

    if (dto.totalCostKgs !== undefined) {
      totalCostKgs = this.roundMoney(dto.totalCostKgs);
      unitCostKgs = resolveUnitCostFromInventoryLayer({
        quantity: quantityAbs,
        totalCostKgs,
      });
    } else {
      unitCostKgs = dto.unitCostKgs ?? Number(product.finalCostKgs);
      totalCostKgs = this.roundMoney(quantityAbs * unitCostKgs);
    }

    const currentTotalValue = Number(current?.totalValueKgs ?? 0);
    const nextAverageCost =
      quantityDelta > 0
        ? this.roundMoney(
            (currentQuantity * Number(current?.averageCostKgs ?? 0) + totalCostKgs) /
              Math.max(currentQuantity + quantityDelta, 1),
          )
        : Number(current?.averageCostKgs ?? product.finalCostKgs);
    const nextTotalValue =
      quantityDelta > 0
        ? this.roundMoney(currentTotalValue + totalCostKgs)
        : this.roundMoney(nextQuantity * nextAverageCost);

    const movement = await tx.stockMovement.create({
      data: {
        branchId: product.branchId,
        warehouseId: warehouse.id,
        productId: product.id,
        type: dto.type,
        quantity: quantityDelta,
        unitCostKgs,
        totalCostKgs,
        note: dto.note,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdById: user.id,
      },
      include: { product: true, warehouse: true },
    });

    await tx.inventoryBalance.upsert({
      where: {
        branchId_warehouseId_productId: {
          branchId: product.branchId,
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
      create: {
        branchId: product.branchId,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: nextQuantity,
        averageCostKgs: nextAverageCost,
        landedCostKgs: quantityDelta > 0 ? unitCostKgs : nextAverageCost,
        totalValueKgs: nextTotalValue,
        ...(quantityDelta > 0 ? { lastReceivingAt: new Date() } : {}),
      },
      update: {
        quantity: nextQuantity,
        averageCostKgs: nextAverageCost,
        landedCostKgs: quantityDelta > 0 ? unitCostKgs : nextAverageCost,
        totalValueKgs: nextTotalValue,
        ...(quantityDelta > 0 ? { lastReceivingAt: new Date() } : {}),
      },
    });

    if (dto.type === StockMovementType.ADJUSTMENT) {
      await this.auditInTx(tx, user, product.branchId, 'INVENTORY_ADJUSTMENT', 'StockMovement', movement.id);
    }

    if (nextQuantity <= product.minStockLevel) {
      await this.notificationsService.notifyInTx(tx, user, {
        type: nextQuantity === 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK,
        branchId: product.branchId,
        entityType: 'Product',
        entityId: product.id,
        referenceNumber: product.sku,
        message: `${product.sku} stock is ${nextQuantity} (minimum ${product.minStockLevel}).`,
      });
    }

    return movement;
  }

  calculateCosts(input: {
    weightKg: number;
    purchasePriceYuan: number;
    yuanRate: number;
    transportCostKgs: number;
    sellingPriceKgs: number;
  }) {
    const purchaseCostKgs = this.roundMoney(input.purchasePriceYuan * input.yuanRate);
    const transportCostKgs = this.roundMoney(input.transportCostKgs);
    const finalCostKgs = this.roundMoney(purchaseCostKgs + transportCostKgs);
    const marginAmount = this.roundMoney(input.sellingPriceKgs - finalCostKgs);
    const marginPercent =
      input.sellingPriceKgs === 0
        ? 0
        : this.roundMoney((marginAmount / input.sellingPriceKgs) * 100);

    return {
      purchaseCostKgs,
      transportCostKgs,
      finalCostKgs,
      sellingPriceKgs: input.sellingPriceKgs,
      marginAmount,
      marginPercent,
    };
  }

  private productInclude() {
    return {
      branch: true,
      warehouse: true,
      productCategory: true,
      defaultSupplier: { select: { id: true, name: true } },
      defaultFactory: { select: { id: true, name: true } },
      inventoryBalances: { include: { warehouse: true } },
    };
  }

  private resolveBranchId(user: AuthUser, requestedBranchId?: string) {
    return resolveWritableBranchId(
      user,
      requestedBranchId,
      this.canAccessAllInventory(user),
    );
  }

  private buildBranchWhere(user: AuthUser, requestedBranchId?: string) {
    const requested = normalizeBranchId(requestedBranchId);
    const userBranch = normalizeBranchId(user.branchId);

    if (this.canAccessAllInventory(user)) {
      return requested ? { branchId: requested } : {};
    }

    if (requested && requested !== userBranch) {
      void this.auditBranchDataAccessDenied(user, requested);
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: userBranch };
  }

  private buildInventoryBalanceWhere(user: AuthUser, requestedBranchId?: string) {
    const requested = normalizeBranchId(requestedBranchId);
    const userBranch = normalizeBranchId(user.branchId);

    if (this.isBranchInventoryUser(user)) {
      if (requested && requested !== userBranch) {
        void this.auditBranchDataAccessDenied(user, requested);
        throw new ForbiddenException('You can only access your own branch warehouse data');
      }
      return {
        branchId: userBranch,
        warehouse: {
          warehouseType: WarehouseType.BRANCH,
          branchId: userBranch,
          deletedAt: null,
        },
      };
    }

    if (this.canAccessAllInventory(user)) {
      return requested ? { branchId: requested } : {};
    }

    if (requested && requested !== userBranch) {
      void this.auditBranchDataAccessDenied(user, requested);
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: userBranch };
  }

  private isBranchInventoryUser(user: AuthUser) {
    return !!normalizeBranchId(user.branchId) && !this.canAccessAllInventory(user);
  }

  private auditBranchDataAccessDenied(user: AuthUser, requestedBranchId?: string, reason?: string) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'BRANCH_DATA_ACCESS_DENIED',
        entity: 'Branch',
        entityId: requestedBranchId ?? user.branchId ?? undefined,
        metadata: {
          userId: user.id,
          role: user.role,
          branchId: user.branchId,
          requestedBranchId: requestedBranchId ?? null,
          reason: reason ?? 'Cross-branch access denied',
          timestamp: new Date().toISOString(),
        },
      },
    }).catch(() => null);
  }

  private buildProductCatalogWhere(
    user: AuthUser,
    requestedBranchId?: string,
  ): Prisma.ProductWhereInput {
    const requested = normalizeBranchId(requestedBranchId);
    const userBranch = normalizeBranchId(user.branchId);

    if (this.isBranchInventoryUser(user)) {
      if (requested && requested !== userBranch) {
        void this.auditBranchDataAccessDenied(user, requested);
        throw new ForbiddenException('You can only access your own branch');
      }
      return {
        branchId: userBranch,
        deletedAt: null,
        warehouse: activeBranchWarehouseWhere,
      };
    }

    if (this.canAccessAllInventory(user)) {
      return requested
        ? { branchId: requested }
        : {
            OR: [
              { branch: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null } },
              { warehouse: activeHqWarehouseWhere },
            ],
          };
    }

    if (canViewProductCatalog(user) && userBranch) {
      if (requested && requested !== userBranch) {
        void this.auditBranchDataAccessDenied(user, requested);
        throw new ForbiddenException('You can only access your own branch');
      }
      return {
        OR: [
          { warehouse: hqWarehouseWhere },
          { branchId: userBranch },
        ],
      };
    }

    return this.buildBranchWhere(user, requestedBranchId);
  }

  private async resolveHqCatalogBranchId(tx: PrismaTx) {
    const branch = await ensureHqCatalogBranch(tx);
    return branch.id;
  }

  private async getActiveCategoryForProductCategoryChange(tx: PrismaTx, id: string) {
    const category = await tx.productCategory.findFirst({ where: { id } });
    if (!category || !category.isActive) {
      throw new NotFoundException('Выбранная категория не найдена');
    }
    return category;
  }

  private async allocateNextProductCode(
    tx: PrismaTx,
    branchId: string,
    categoryId: string,
    prefix: string,
    exceptProductId: string,
    maxAttempts = 5,
  ): Promise<string> {
    let usedCodes = await this.collectCategoryProductCodes(tx, categoryId, prefix);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = nextProductCode(prefix, usedCodes);
      try {
        await this.ensureSkuAvailable(tx, branchId, candidate, exceptProductId);
        return candidate;
      } catch (error) {
        if (error instanceof ConflictException) {
          usedCodes = [...usedCodes, candidate];
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Не удалось сформировать уникальный код товара');
  }

  private async ensureSkuAvailable(
    tx: PrismaTx,
    branchId: string,
    sku: string,
    exceptId?: string,
  ) {
    const normalizedSku = normalizeProductCode(sku);
    const existing = await tx.product.findFirst({
      where: {
        branchId,
        sku: { equals: normalizedSku, mode: 'insensitive' },
        deletedAt: null,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Active product with this product code already exists');
    }
  }

  private async collectCategoryProductCodes(
    tx: PrismaTx,
    categoryId: string,
    prefix: string,
  ): Promise<string[]> {
    const [products, migrations] = await Promise.all([
      tx.product.findMany({
        where: { categoryId },
        select: { sku: true },
      }),
      tx.productCodeMigration.findMany({
        where: {
          OR: [
            { oldCode: { startsWith: prefix, mode: 'insensitive' } },
            { newCode: { startsWith: prefix, mode: 'insensitive' } },
          ],
        },
        select: { oldCode: true, newCode: true },
      }),
    ]);

    const codes = new Set<string>();
    for (const product of products) {
      if (product.sku) codes.add(normalizeProductCode(product.sku));
    }
    for (const migration of migrations) {
      if (migration.oldCode) codes.add(normalizeProductCode(migration.oldCode));
      if (migration.newCode) codes.add(normalizeProductCode(migration.newCode));
    }
    return [...codes];
  }

  private async ensureCategoryCodeAvailable(code: string, exceptId?: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: {
        code: code.toUpperCase(),
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Category code already exists');
    }
  }

  private async getActiveCategory(tx: PrismaTx, id: string) {
    const category = await tx.productCategory.findFirst({
      where: { id, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private async getProductForRead(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.buildProductCatalogWhere(user),
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async getProductResponseInTx(
    tx: PrismaTx,
    user: AuthUser,
    id: string,
  ) {
    const product = await tx.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.buildProductCatalogWhere(user),
      },
      include: {
        ...this.productInclude(),
        priceHistory: {
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { effectiveFrom: 'desc' },
        },
        purchasePriceHistory: {
          include: {
            supplier: { select: { id: true, name: true } },
            factory: { select: { id: true, name: true } },
            changedBy: { select: { id: true, fullName: true, role: true } },
            procurementOrder: { select: { id: true, orderNumber: true } },
          },
          orderBy: { effectiveDate: 'desc' },
          take: 20,
        },
        stockMovements: {
          include: {
            warehouse: true,
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.pricingFifoService.syncFifoBatchesFromHqStockMovements();
    return this.toProductResponseWithFifoCost(product, user);
  }

  private async getProductForWrite(tx: PrismaTx | PrismaService, user: AuthUser, id: string) {
    const product = await tx.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(this.canAccessAllInventory(user)
          ? {}
          : this.buildProductCatalogWhere(user)),
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async getWarehouseForWrite(tx: PrismaTx | PrismaService, user: AuthUser, id: string) {
    const warehouse = await tx.warehouse.findFirst({
      where: {
        id,
        ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }),
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  private async getWarehouseForCatalogWrite(tx: PrismaTx | PrismaService, user: AuthUser, id: string) {
    this.assertCanManageProductCatalog(user);
    const warehouse = await tx.warehouse.findFirst({
      where: { id, deletedAt: null },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse is required');
    }
    this.assertActiveWarehouseForProduct(warehouse);
    return warehouse;
  }

  private assertActiveWarehouseForProduct(warehouse: { isActive: boolean; deletedAt: Date | null }) {
    if (warehouse.deletedAt || !warehouse.isActive) {
      throw new BadRequestException('Cannot add product to inactive warehouse');
    }
  }

  private assertPositiveProductWeight(weightKg: number) {
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new BadRequestException('Product weight must be greater than zero');
    }
  }

  private async syncProductWeightToOpenProcurementOrders(
    tx: PrismaTx,
    productId: string,
    newWeightKg: number,
  ) {
    const completedStatuses: ProcurementOrderStatus[] = [
      ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
      ProcurementOrderStatus.CLOSED,
      ProcurementOrderStatus.CANCELLED,
    ];

    const orders = await tx.procurementOrder.findMany({
      where: {
        deletedAt: null,
        hqStockMovementCreatedAt: null,
        status: { notIn: completedStatuses },
        items: { some: { productId } },
      },
      include: { items: true },
    });

    for (const order of orders) {
      const exchangeRate = Number(order.defaultYuanRate);
      const logistics = extractLogisticsCosts(order);
      const cargo = extractCargoConfig(order);
      let calculated;
      try {
        calculated = calculateLandedCosts(
          order.items.map((item) => mapStoredProcurementItemToLandedCostInput({
            ...item,
            weightKg: item.productId === productId ? newWeightKg : Number(item.netWeightKg ?? item.weightKg),
            yuanRate: exchangeRate,
          })),
          logistics,
          { cargo },
        );
      } catch (error) {
        if (error instanceof Error && error.message === CARGO_WEIGHT_LESS_THAN_NET) {
          throw new BadRequestException('Cargo total weight cannot be less than product net weight.');
        }
        throw error;
      }
      const { logistics: resolvedLogistics } = buildLogisticsWithCargo(
        logistics,
        Number(cargo.cargoTotalWeightKg ?? 0),
        cargo,
      );

      for (const [index, item] of order.items.entries()) {
        const next = calculated.items[index];
        await tx.procurementOrderItem.update({
          where: { id: item.id },
          data: {
            ...(item.productId === productId ? { weightKg: newWeightKg, netWeightKg: newWeightKg } : {}),
            totalWeightKg: next.totalWeightKg,
            costKgs: next.costKgs,
            chinaDomesticAllocKgs: next.chinaDomesticAllocKgs,
            chinaExportAllocKgs: next.chinaExportAllocKgs,
            localTransportAllocKgs: next.localTransportAllocKgs,
            packagingAllocKgs: next.packagingAllocKgs,
            customsAllocKgs: next.customsAllocKgs,
            insuranceAllocKgs: next.insuranceAllocKgs,
            bankFeeAllocKgs: next.bankFeeAllocKgs,
            otherAllocKgs: next.otherAllocKgs,
            transportCostKgs: next.transportCostKgs,
            finalCostKgs: next.finalCostKgs,
            totalYuan: next.totalYuan,
            totalCostKgs: next.totalCostKgs,
          },
        });
      }

      await tx.procurementOrder.update({
        where: { id: order.id },
        data: {
          totalYuan: calculated.totalYuan,
          totalTransportCostKgs: calculated.totalTransportCostKgs,
          totalCostKgs: calculated.totalCostKgs,
          totalWeightKg: calculated.totalShipmentWeightKg,
          totalNetWeightKg: calculated.totalNetWeightKg,
          totalPackagingWeightKg: calculated.totalPackagingWeightKg,
          totalCargoCostUsd: calculated.totalCargoCostUsd,
          totalCargoCostKgs: calculated.totalCargoCostKgs,
          costPerKg: calculated.costPerKg,
          chinaExportTransportKgs: resolvedLogistics.chinaExportTransportKgs,
        },
      });
    }
  }

  private assertCanManageProductCatalog(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    if (roles.includes(Role.WAREHOUSE_MANAGER) && !hasAnyFullAccessRole(roles)) {
      void this.prisma.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRODUCT_CREATE_DENIED_FOR_WAREHOUSE_MANAGER',
          entity: 'Product',
          entityId: null,
          metadata: {
            userId: user.id,
            role: user.role,
            roles,
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      throw new ForbiddenException('You do not have permission to manage product catalog');
    }
    if (!canManageProductCatalog(user)) {
      throw new ForbiddenException('You do not have permission to manage product catalog');
    }
  }

  private auditCategory(
    user: AuthUser,
    action: string,
    categoryId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'ProductCategory',
        entityId: categoryId,
        metadata: {
          userId: user.id,
          role: user.role,
          categoryId: categoryId === 'new' ? null : categoryId,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private auditProductAccessDenied(
    user: AuthUser,
    productId: string,
    branchId: string | null,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action,
        entity: 'Product',
        entityId: productId,
        metadata: {
          userId: user.id,
          role: user.role,
          productId,
          branchId,
          roles: user.roles ?? [user.role],
          timestamp: new Date().toISOString(),
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private assertCanEditPurchasePriceYuan(user: AuthUser) {
    if (!canEditPurchasePriceYuan(user)) {
      throw new ForbiddenException('You do not have permission to change purchase price');
    }
  }

  private assertCanArchiveProduct(user: AuthUser) {
    if (!canArchiveProduct(user)) {
      throw new ForbiddenException('You do not have permission to archive products');
    }
  }

  private logProductCreateFailure(user: AuthUser, dto: CreateProductDto, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown product create error';
    this.logger.warn({
      message: 'Product create failed',
      userId: user.id,
      roles: user.roles ?? [user.role],
      branchId: user.branchId,
      sku: dto?.sku,
      productName: dto?.name,
      payloadKeys: Object.keys(dto ?? {}),
      errorCode: typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined,
      error: message,
    });
  }

  private isUniqueConstraintError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
  }

  private getQuantityDelta(type: StockMovementType, quantity: number) {
    const absolute = Math.abs(quantity);

    if (type === StockMovementType.IN) return absolute;
    if (type === StockMovementType.INVENTORY_ADJUSTMENT_IN) return absolute;
    if (
      type === StockMovementType.OUT ||
      type === StockMovementType.SALE ||
      type === StockMovementType.SERVICE_USE ||
      type === StockMovementType.INVENTORY_ADJUSTMENT_OUT
    ) {
      return -absolute;
    }

    return quantity;
  }

  private canAccessAllInventory(user: AuthUser) {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((role) =>
      isFullAccessRole(role) ||
      role === Role.SUPPLY_CHAIN_MANAGER ||
      role === Role.WAREHOUSE_MANAGER
    );
  }

  private auditInTx(
    tx: PrismaTx,
    user: AuthUser,
    branchId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, unknown>,
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
        } as Prisma.InputJsonValue,
      },
    });
  }

  private toProductResponse(product: any, user?: AuthUser) {
    const totalQuantity =
      product.inventoryBalances?.reduce(
        (sum: number, balance: any) => sum + balance.quantity,
        0,
      ) ?? 0;

    const response = {
      ...product,
      weightKg: Number(product.weightKg),
      purchasePriceYuan: Number(product.purchasePriceYuan),
      purchasePriceUpdatedAt: product.purchasePriceUpdatedAt ?? null,
      latestYuanRate: Number(product.latestYuanRate),
      purchaseCostKgs: Number(product.purchaseCostKgs),
      transportCostKgs: Number(product.transportCostKgs),
      // Stale Product.finalCostKgs snapshot — callers that display Себестоимость
      // must use toProductResponseWithFifoCost (active HQ FIFO layer).
      finalCostKgs: Number(product.finalCostKgs),
      sellingPriceKgs: Number(product.sellingPriceKgs),
      marginAmount: Number(product.marginAmount),
      marginPercent: Number(product.marginPercent),
      quantity: totalQuantity,
      lowStock: totalQuantity <= product.minStockLevel,
      purchasePriceHistory: product.purchasePriceHistory?.map((row: any) => ({
        ...row,
        oldPriceYuan: Number(row.oldPriceYuan),
        newPriceYuan: Number(row.newPriceYuan),
        differenceYuan: Number(row.differenceYuan),
      })),
    };

    return user ? this.applyProductProfileVisibility(user, response) : response;
  }

  private async resolveDefaultHqWarehouseId() {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: activeHqWarehouseWhere,
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return warehouse?.id ?? null;
  }

  /**
   * Product catalog / detail cost: oldest active HQ FIFO batch unit landed cost.
   * Same layer used for FIFO consumption — remainingQuantity > 0, receivedAt ASC.
   */
  private async toProductResponseWithFifoCost(product: any, user?: AuthUser) {
    const base = this.toProductResponse(product, user);
    const hqWarehouseId = await this.resolveDefaultHqWarehouseId();
    const fifo = await this.pricingFifoService.getOldestActiveHqFifoCost({
      productId: product.id,
      ...(hqWarehouseId ? { warehouseId: hqWarehouseId } : {}),
    });
    const catalogCost = mapProductCatalogFifoCost({ fifo });
    const response = {
      ...base,
      ...catalogCost,
      storedCostPriceKgs: Number(product.costPriceKgs),
      storedFinalCostKgs: Number(product.finalCostKgs),
    };
    delete (response as { costPriceKgs?: unknown }).costPriceKgs;
    return user ? this.applyProductProfileVisibility(user, response) : response;
  }

  private shouldHideProductPricingFields(user: AuthUser) {
    const roles = resolveUserRoles(user);
    return roles.includes(Role.SUPPLY_CHAIN_MANAGER) && !hasAnyFullAccessRole(roles);
  }

  private applyProductProfileVisibility(user: AuthUser, payload: Record<string, unknown>) {
    if (!this.shouldHideProductPricingFields(user)) {
      return payload;
    }

    void this.prisma.auditLog
      .create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'PRODUCT_PROFILE_SENSITIVE_FIELDS_HIDDEN',
          entity: 'Product',
          entityId: String(payload.id ?? ''),
          metadata: {
            userId: user.id,
            role: user.role,
            productId: payload.id,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    const next: Record<string, unknown> = { ...payload };
    for (const key of [
      'sellingPriceKgs',
      'marginAmount',
      'marginPercent',
      'wholesalePriceKgs',
      'recommendedRetailPriceKgs',
      'minimumSellingPriceKgs',
      'hqBranchWholesalePriceKgs',
    ]) {
      delete next[key];
    }

    if (Array.isArray(next.priceHistory)) {
      next.priceHistory = next.priceHistory.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const historyRow = { ...(row as Record<string, unknown>) };
        delete historyRow.sellingPriceKgs;
        delete historyRow.marginAmount;
        delete historyRow.marginPercent;
        return historyRow;
      });
    }

    return next;
  }

  private toBalanceResponse(balance: any, user?: AuthUser) {
    const quantity = balance.quantity;
    const reservedQuantity = balance.reservedQuantity ?? 0;
    const response = {
      id: balance.id,
      branchId: balance.branchId,
      warehouseId: balance.warehouseId,
      productId: balance.productId,
      product: balance.product,
      sku: balance.product.sku,
      warehouse: balance.warehouse,
      quantity,
      reservedQuantity,
      availableQuantity: Math.max(quantity - reservedQuantity, 0),
      averageCostKgs: Number(balance.averageCostKgs),
      landedCostKgs: Number(balance.landedCostKgs ?? balance.averageCostKgs),
      totalValueKgs: Number(balance.totalValueKgs),
      lastReceivingAt: balance.lastReceivingAt ?? null,
      minStockLevel: balance.product.minStockLevel,
      lowStock: quantity <= balance.product.minStockLevel,
      updatedAt: balance.updatedAt,
    };
    return user && isBranchWarehouseOperator(user) ? this.stripCostFields(response) : response;
  }

  private assertCanViewProductCatalog(user: AuthUser) {
    if (!canViewProductCatalog(user)) {
      throw new ForbiddenException('У вас нет доступа к справочнику товаров');
    }
  }

  private assertCanViewProductCost(user: AuthUser) {
    if (isBranchWarehouseOperator(user)) {
      throw new ForbiddenException('You do not have permission to view product cost');
    }
  }

  private stripCostFields<T extends Record<string, unknown>>(payload: T): T {
    const hidden = [
      'purchasePriceYuan',
      'purchaseCostKgs',
      'transportCostKgs',
      'finalCostKgs',
      'sellingPriceKgs',
      'marginAmount',
      'marginPercent',
      'averageCostKgs',
      'landedCostKgs',
      'totalValueKgs',
      'totalStockValueKgs',
      'wholesalePriceKgs',
      'latestYuanRate',
      'priceHistory',
      'purchasePriceHistory',
    ];
    const next: Record<string, unknown> = { ...payload };
    for (const key of hidden) {
      delete next[key];
    }
    if (next.product && typeof next.product === 'object') {
      next.product = this.stripCostFields(next.product as Record<string, unknown>);
    }
    return next as T;
  }

  private groupStockValue<T extends { quantity: number; totalValueKgs: Prisma.Decimal }>(
    balances: T[],
    keyFn: (item: T) => string,
  ) {
    const grouped = new Map<string, { quantity: number; totalStockValueKgs: number }>();

    for (const item of balances) {
      const key = keyFn(item);
      const current = grouped.get(key) ?? { quantity: 0, totalStockValueKgs: 0 };
      current.quantity += item.quantity;
      current.totalStockValueKgs = this.roundMoney(
        current.totalStockValueKgs + Number(item.totalValueKgs),
      );
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([name, value]) => ({
      name,
      ...value,
    }));
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isHqSalesManagerScoped(user: AuthUser) {
    const roles = resolveUserRoles(user);
    return roles.includes(Role.HQ_SALES_MANAGER) && !hasAnyFullAccessRole(roles);
  }

  private async assertHqWarehouseStockAccess(
    user: AuthUser | null | undefined,
    warehouseId: string,
    branchId?: string,
  ) {
    if (!user) {
      return;
    }

    const roles = resolveUserRoles(user);
    if (hasAnyFullAccessRole(roles)) {
      return;
    }
    if (roles.includes(Role.WAREHOUSE_MANAGER) || roles.includes(Role.SUPPLY_CHAIN_MANAGER)) {
      return;
    }

    if (!this.isHqSalesManagerScoped(user)) {
      return;
    }

    const assignedIds = (
      await this.prisma.hqSalesManagerWarehouseAssignment.findMany({
        where: { userId: user.id, status: HqWarehouseAssignmentStatus.ACTIVE },
        select: { warehouseId: true },
      })
    ).map((row) => row.warehouseId);

    if (!assignedIds.length) {
      return;
    }

    if (!assignedIds.includes(warehouseId)) {
      await this.auditHqStockLookupDenied(user, warehouseId, branchId);
      throw new ForbiddenException({
        message: HQ_WAREHOUSE_ACCESS_DENIED,
        messages: HQ_WAREHOUSE_ACCESS_DENIED_MESSAGES,
      });
    }
  }

  private auditHqStockLookup(
    user: AuthUser,
    warehouseId: string,
    branchId: string | undefined,
    items: Array<{ productId: string; sku?: string }>,
    quantities: Map<string, number>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_STOCK_LOOKUP',
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          userId: user.id,
          warehouseId,
          branchId: branchId ?? null,
          productId: items.length === 1 ? items[0].productId : null,
          availableQty: items.length === 1 ? quantities.get(items[0].productId) ?? 0 : null,
          items: items.map((item) => ({
            productId: item.productId,
            sku: item.sku ?? null,
            availableQty: quantities.get(item.productId) ?? 0,
          })),
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private auditHqStockLookupDenied(user: AuthUser, warehouseId: string, branchId?: string) {
    return this.prisma.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: 'HQ_STOCK_LOOKUP_DENIED',
        entity: 'Warehouse',
        entityId: warehouseId,
        metadata: {
          userId: user.id,
          warehouseId,
          branchId: branchId ?? null,
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
