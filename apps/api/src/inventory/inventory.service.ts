import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, Prisma, ProcurementOrderStatus, PurchasePriceChangeReason, Role, StockMovementStatus, StockMovementType, WarehouseType } from '@prisma/client';
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
  isHqWarehouse,
} from '../warehouse/warehouse.util';
import { PrismaService } from '../prisma/prisma.service';
import { canArchiveProduct, canEditPurchasePriceYuan, canManageProductCatalog, canViewProductCatalog, hasAnyFullAccessRole, isFullAccessRole } from '../rbac/rbac';
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
import { buildLogisticsWithCargo, calculateLandedCosts, CARGO_WEIGHT_LESS_THAN_NET, extractCargoConfig, extractLogisticsCosts, mapStoredProcurementItemToLandedCostInput } from '../procurement/landed-cost.util';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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
    await this.ensureCategoryCodeAvailable(dto.code);
    const category = await this.prisma.productCategory.create({
      data: {
        code: dto.code.toUpperCase(),
        nameKy: dto.nameKy,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
    await this.auditCategory(user, 'CATEGORY_CREATED', category.id, { categoryId: category.id, newValue: category });
    return category;
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

    if (dto.code) {
      await this.ensureCategoryCodeAvailable(dto.code, id);
    }

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        code: dto.code?.toUpperCase(),
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
    return category;
  }

  async deleteCategory(user: AuthUser, id: string) {
    this.assertCanArchiveProduct(user);
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

  async createProduct(user: AuthUser, dto: CreateProductDto) {
    try {
      this.assertCanManageProductCatalog(user);
      return await this.prisma.$transaction(async (tx) => {
        if (!dto.name?.trim()) throw new BadRequestException('Product name is required');
        if (!dto.sku?.trim()) throw new BadRequestException('SKU is required');
        if (!dto.categoryId) throw new BadRequestException('Category is required');
        if (!dto.warehouseId) throw new BadRequestException('Warehouse is required');
        const warehouse = await this.getWarehouseForCatalogWrite(tx, user, dto.warehouseId);
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
        const costs = this.calculateCosts({
          weightKg: dto.weightKg,
          purchasePriceYuan: dto.purchasePriceYuan,
          yuanRate: dto.latestYuanRate,
          transportCostKgs:
            dto.transportCostKgs ??
            dto.weightKg * Number(dto.transportCostPerKg ?? 0),
          sellingPriceKgs: dto.sellingPriceKgs,
        });
        const existingProduct = await tx.product.findFirst({
          where: { branchId, sku: dto.sku },
          include: this.productInclude(),
        });

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
              latestYuanRate: dto.latestYuanRate,
              ...costs,
              minStockLevel: dto.minStockLevel ?? 0,
              priceHistory: {
                create: {
                  purchasePriceYuan: dto.purchasePriceYuan,
                  yuanRate: dto.latestYuanRate,
                  ...costs,
                  effectiveFrom: new Date(),
                  createdById: user.id,
                },
              },
            },
          });

          if (dto.initialQuantity && dto.initialQuantity > 0) {
            await this.createStockMovementInTx(tx, user, {
              productId: existingProduct.id,
              warehouseId: warehouse.id,
              type: StockMovementType.IN,
              quantity: dto.initialQuantity,
              unitCostKgs: costs.finalCostKgs,
              note: 'Restored product initial stock',
              referenceType: 'PRODUCT_RESTORE',
              referenceId: existingProduct.id,
            });
          }

          return {
            ...(await this.getProductResponseInTx(tx, user, existingProduct.id)),
            restored: true,
          };
        }

        const product = await tx.product.create({
          data: {
            branchId,
            warehouseId: warehouse.id,
            name: dto.name,
            sku: dto.sku,
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
            latestYuanRate: dto.latestYuanRate,
            ...costs,
            minStockLevel: dto.minStockLevel ?? 0,
            isActive: dto.isActive ?? true,
            priceHistory: {
              create: {
                purchasePriceYuan: dto.purchasePriceYuan,
                yuanRate: dto.latestYuanRate,
                ...costs,
                effectiveFrom: new Date(),
                createdById: user.id,
              },
            },
          },
          include: this.productInclude(),
        });

        if (dto.initialQuantity && dto.initialQuantity > 0) {
          await this.createStockMovementInTx(tx, user, {
            productId: product.id,
            warehouseId: product.warehouseId,
            type: StockMovementType.IN,
            quantity: dto.initialQuantity,
            unitCostKgs: Number(product.finalCostKgs),
            note: 'Initial stock',
            referenceType: 'PRODUCT_CREATE',
            referenceId: product.id,
          });
        }

        await this.auditInTx(tx, user, branchId, 'PRODUCT_CREATED', 'Product', product.id, {
          module: 'inventory',
          sku: product.sku,
          newValue: { name: product.name, sku: product.sku, weightKg: Number(product.weightKg) },
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

    return {
      items: items.map((product) => this.toProductResponse(product)),
      total,
      page,
      pageSize,
    };
  }

  async product(user: AuthUser, id: string) {
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

    return this.toProductResponse(product);
  }

  async updateProduct(user: AuthUser, id: string, dto: UpdateProductDto) {
    this.assertCanManageProductCatalog(user);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getProductForWrite(tx, user, id);

      if (dto.sku && dto.sku !== current.sku) {
        await this.ensureSkuAvailable(tx, current.branchId, dto.sku, current.id);
      }

      if (dto.warehouseId) {
        const warehouse = await this.getWarehouseForCatalogWrite(tx, user, dto.warehouseId);
        assertProductWarehouseBranchMatch(warehouse, current.branchId);
      }

      const oldWarehouseId = current.warehouseId;
      const warehouseChanged =
        dto.warehouseId !== undefined && dto.warehouseId !== oldWarehouseId;
      const category = dto.categoryId
        ? await this.getActiveCategory(tx, dto.categoryId)
        : null;

      const oldWeightKg = Number(current.weightKg);
      if (dto.weightKg !== undefined) {
        this.assertPositiveProductWeight(dto.weightKg);
      }
      const weightChanged =
        dto.weightKg !== undefined && Number(dto.weightKg) !== oldWeightKg;

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

      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          sku: dto.sku,
          categoryId: category?.id,
          category: category?.nameEn,
          warehouseId: dto.warehouseId,
          photoUrl: dto.photoUrl,
          description: dto.description,
          characteristics: dto.characteristics as Prisma.InputJsonValue,
          unit: dto.unit,
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

      await this.auditInTx(tx, user, current.branchId, 'PRODUCT_UPDATED', 'Product', id, {
        module: 'inventory',
        sku: dto.sku ?? current.sku,
        oldValue: { name: current.name, sku: current.sku, sellingPriceKgs: Number(current.sellingPriceKgs) },
        newValue: {
          name: dto.name ?? current.name,
          sku: dto.sku ?? current.sku,
          sellingPriceKgs: next.sellingPriceKgs,
        },
      });

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

      return this.getProductResponseInTx(tx, user, id);
    });
  }

  async deleteProduct(user: AuthUser, id: string) {
    this.assertCanArchiveProduct(user);
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
    await this.getProductForRead(user, productId);
    return this.prisma.productPriceHistory.findMany({
      where: { productId },
      include: { createdBy: { select: { id: true, fullName: true, role: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async purchasePriceHistoryForProduct(user: AuthUser, productId: string) {
    await this.getProductForRead(user, productId);
    return this.queryPurchasePriceHistory({ productId });
  }

  async purchasePriceHistoryReport(
    user: AuthUser,
    query: PurchasePriceHistoryQueryDto,
  ) {
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
    });
  }

  warehouses(user: AuthUser, branchId?: string, warehouseType?: string, status?: string) {
    const activeOnly = status?.toUpperCase() === 'ACTIVE';
    const where: Prisma.WarehouseWhereInput = {
      ...this.buildBranchWhere(user, branchId),
      ...(warehouseType === 'HQ'
        ? activeOnly
          ? activeHqWarehouseWhere
          : hqWarehouseWhere
        : warehouseType === 'BRANCH'
          ? activeOnly
            ? activeBranchWarehouseWhere
            : branchWarehouseWhere
          : { deletedAt: null }),
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
        ...this.buildBranchWhere(user, query.branchId),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
    });

    return balances.map((balance) => this.toBalanceResponse(balance));
  }

  async stockValue(user: AuthUser, branchId?: string) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: this.buildBranchWhere(user, branchId),
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

  async createStockMovementInTx(
    tx: PrismaTx,
    user: AuthUser,
    dto: CreateStockMovementDto,
  ) {
    const product = await this.getProductForWrite(tx, user, dto.productId);
    const warehouse = await this.getWarehouseForWrite(tx, user, dto.warehouseId);

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

    const unitCostKgs = dto.unitCostKgs ?? Number(product.finalCostKgs);
    const totalCostKgs = this.roundMoney(Math.abs(dto.quantity) * unitCostKgs);
    const nextAverageCost =
      quantityDelta > 0
        ? this.roundMoney(
            ((currentQuantity * Number(current?.averageCostKgs ?? 0)) +
              quantityDelta * unitCostKgs) /
              Math.max(currentQuantity + quantityDelta, 1),
          )
        : Number(current?.averageCostKgs ?? product.finalCostKgs);
    const nextTotalValue = this.roundMoney(nextQuantity * nextAverageCost);

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
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: userBranch };
  }

  private buildProductCatalogWhere(
    user: AuthUser,
    requestedBranchId?: string,
  ): Prisma.ProductWhereInput {
    const requested = normalizeBranchId(requestedBranchId);
    const userBranch = normalizeBranchId(user.branchId);

    if (this.canAccessAllInventory(user)) {
      return requested ? { branchId: requested } : {};
    }

    if (canViewProductCatalog(user) && userBranch) {
      if (requested && requested !== userBranch) {
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
    const existing = await tx.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const created = await tx.branch.create({
      data: {
        code: HQ_CATALOG_BRANCH_CODE,
        name: 'EMOTORS HQ Catalog',
        city: 'Bishkek',
      },
      select: { id: true },
    });
    return created.id;
  }

  private async ensureSkuAvailable(
    tx: PrismaTx,
    branchId: string,
    sku: string,
    exceptId?: string,
  ) {
    const existing = await tx.product.findFirst({
      where: {
        branchId,
        sku,
        deletedAt: null,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Duplicate SKU in this branch');
    }
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

    return this.toProductResponse(product);
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
          categoryId,
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

  private toProductResponse(product: any) {
    const totalQuantity =
      product.inventoryBalances?.reduce(
        (sum: number, balance: any) => sum + balance.quantity,
        0,
      ) ?? 0;

    return {
      ...product,
      weightKg: Number(product.weightKg),
      purchasePriceYuan: Number(product.purchasePriceYuan),
      purchasePriceUpdatedAt: product.purchasePriceUpdatedAt ?? null,
      latestYuanRate: Number(product.latestYuanRate),
      purchaseCostKgs: Number(product.purchaseCostKgs),
      transportCostKgs: Number(product.transportCostKgs),
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
  }

  private toBalanceResponse(balance: any) {
    const quantity = balance.quantity;
    const reservedQuantity = balance.reservedQuantity ?? 0;
    return {
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
}
