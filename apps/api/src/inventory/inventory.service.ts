import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StockMovementStatus, StockMovementType } from '@prisma/client';
import { MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isFullAccessRole } from '../rbac/rbac';
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
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createCategory(dto: CreateCategoryDto) {
    await this.ensureCategoryCodeAvailable(dto.code);
    return this.prisma.productCategory.create({
      data: {
        code: dto.code.toUpperCase(),
        nameKy: dto.nameKy,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
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

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.category(id);

    if (dto.code) {
      await this.ensureCategoryCodeAvailable(dto.code, id);
    }

    return this.prisma.productCategory.update({
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
  }

  async deleteCategory(id: string) {
    const category = await this.category(id);

    if (category.productCount > 0) {
      return this.prisma.productCategory.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.productCategory.delete({ where: { id } });
  }

  async createProduct(user: AuthUser, dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.getWarehouseForWrite(tx, user, dto.warehouseId);
      const branchId = this.resolveBranchId(user, dto.branchId ?? warehouse.branchId);

      if (warehouse.branchId !== branchId) {
        throw new BadRequestException('Warehouse does not belong to branch');
      }

      const category = await this.getActiveCategory(tx, dto.categoryId);
      await this.ensureSkuAvailable(tx, branchId, dto.sku);
      const costs = this.calculateCosts({
        weightKg: dto.weightKg,
        purchasePriceYuan: dto.purchasePriceYuan,
        yuanRate: dto.latestYuanRate,
        transportCostKgs:
          dto.transportCostKgs ??
          dto.weightKg * Number(dto.transportCostPerKg ?? 0),
        sellingPriceKgs: dto.sellingPriceKgs,
      });

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

      return this.getProductResponseInTx(tx, user, product.id);
    });
  }

  async products(user: AuthUser, query: ProductQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...this.buildBranchWhere(user, query.branchId),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
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
        ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        ...this.productInclude(),
        priceHistory: {
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { effectiveFrom: 'desc' },
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
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getProductForWrite(tx, user, id);

      if (dto.sku && dto.sku !== current.sku) {
        await this.ensureSkuAvailable(tx, current.branchId, dto.sku, current.id);
      }

      if (dto.warehouseId) {
        const warehouse = await this.getWarehouseForWrite(tx, user, dto.warehouseId);
        if (warehouse.branchId !== current.branchId) {
          throw new BadRequestException('Warehouse does not belong to branch');
        }
      }
      const category = dto.categoryId
        ? await this.getActiveCategory(tx, dto.categoryId)
        : null;

      const next = {
        weightKg: dto.weightKg ?? Number(current.weightKg),
        purchasePriceYuan:
          dto.purchasePriceYuan ?? Number(current.purchasePriceYuan),
        latestYuanRate: dto.latestYuanRate ?? Number(current.latestYuanRate),
        transportCostKgs:
          dto.transportCostKgs ??
          (dto.transportCostPerKg !== undefined || dto.weightKg !== undefined
            ? (dto.weightKg ?? Number(current.weightKg)) *
              Number(dto.transportCostPerKg ?? 0)
            : Number(current.transportCostKgs)),
        sellingPriceKgs:
          dto.sellingPriceKgs ?? Number(current.sellingPriceKgs),
      };
      const costs = this.calculateCosts({
        weightKg: next.weightKg,
        purchasePriceYuan: next.purchasePriceYuan,
        yuanRate: next.latestYuanRate,
        transportCostKgs: next.transportCostKgs,
        sellingPriceKgs: next.sellingPriceKgs,
      });
      const priceChanged =
        dto.purchasePriceYuan !== undefined ||
        dto.latestYuanRate !== undefined ||
        dto.transportCostKgs !== undefined ||
        dto.transportCostPerKg !== undefined ||
        dto.weightKg !== undefined ||
        dto.sellingPriceKgs !== undefined;

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
          weightKg: next.weightKg,
          purchasePriceYuan: next.purchasePriceYuan,
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

      return this.getProductResponseInTx(tx, user, id);
    });
  }

  async deleteProduct(user: AuthUser, id: string) {
    await this.getProductForWrite(this.prisma, user, id);
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
    return this.prisma.$transaction(async (tx) => {
      const product = await this.getProductForWrite(tx, user, productId);
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
    return this.prisma.warehouse.create({
      data: {
        branchId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        isActive: dto.isActive ?? true,
      },
    });
  }

  warehouses(user: AuthUser, branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: this.buildBranchWhere(user, branchId),
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

    if (product.branchId !== warehouse.branchId) {
      throw new BadRequestException('Product and warehouse branch mismatch');
    }

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

    if (nextQuantity < 0 && !(isFullAccessRole(user.role) && dto.type === StockMovementType.ADJUSTMENT)) {
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
        totalValueKgs: nextTotalValue,
      },
      update: {
        quantity: nextQuantity,
        averageCostKgs: nextAverageCost,
        totalValueKgs: nextTotalValue,
      },
    });

    if (dto.type === StockMovementType.ADJUSTMENT) {
      await this.auditInTx(tx, user, product.branchId, 'INVENTORY_ADJUSTMENT', 'StockMovement', movement.id);
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
      inventoryBalances: { include: { warehouse: true } },
    };
  }

  private resolveBranchId(user: AuthUser, requestedBranchId?: string) {
    if (this.canAccessAllInventory(user)) {
      return requestedBranchId ?? user.branchId;
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return user.branchId;
  }

  private buildBranchWhere(user: AuthUser, requestedBranchId?: string) {
    if (this.canAccessAllInventory(user)) {
      return requestedBranchId ? { branchId: requestedBranchId } : {};
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: user.branchId };
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
        ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }),
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
        ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }),
      },
      include: {
        ...this.productInclude(),
        priceHistory: {
          include: {
            createdBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { effectiveFrom: 'desc' },
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
        ...(this.canAccessAllInventory(user) ? {} : { branchId: user.branchId }),
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

  private getQuantityDelta(type: StockMovementType, quantity: number) {
    const absolute = Math.abs(quantity);

    if (type === StockMovementType.IN) return absolute;
    if (
      type === StockMovementType.OUT ||
      type === StockMovementType.SALE ||
      type === StockMovementType.SERVICE_USE
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
        },
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
      latestYuanRate: Number(product.latestYuanRate),
      purchaseCostKgs: Number(product.purchaseCostKgs),
      transportCostKgs: Number(product.transportCostKgs),
      finalCostKgs: Number(product.finalCostKgs),
      sellingPriceKgs: Number(product.sellingPriceKgs),
      marginAmount: Number(product.marginAmount),
      marginPercent: Number(product.marginPercent),
      quantity: totalQuantity,
      lowStock: totalQuantity <= product.minStockLevel,
    };
  }

  private toBalanceResponse(balance: any) {
    return {
      id: balance.id,
      branchId: balance.branchId,
      warehouseId: balance.warehouseId,
      productId: balance.productId,
      product: balance.product,
      sku: balance.product.sku,
      warehouse: balance.warehouse,
      quantity: balance.quantity,
      averageCostKgs: Number(balance.averageCostKgs),
      totalValueKgs: Number(balance.totalValueKgs),
      minStockLevel: balance.product.minStockLevel,
      lowStock: balance.quantity <= balance.product.minStockLevel,
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
