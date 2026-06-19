import { Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { BranchAccessService } from '../common/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  StockMovementDto,
  UpdateProductDto,
  WarehouseDto,
  YuanRateDto,
} from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  createProduct(user: AuthUser, dto: CreateProductDto) {
    const branchId = this.branchAccess.resolveBranchId(user, dto.branchId);
    const costs = this.calculateCosts(dto);
    return this.prisma.product.create({
      data: {
        branchId,
        name: dto.name,
        sku: dto.sku,
        category: dto.category,
        photoUrl: dto.photoUrl,
        description: dto.description,
        weightKg: dto.weightKg ?? 0,
        purchasePriceYuan: dto.purchasePriceYuan ?? 0,
        latestYuanRate: dto.latestYuanRate ?? 0,
        transportCostKgs: dto.transportCostKgs ?? 0,
        finalCostKgs: costs.finalCostKgs,
        sellingPriceKgs: dto.sellingPriceKgs ?? 0,
        marginPercent: costs.marginPercent,
        minStockLevel: dto.minStockLevel ?? 0,
      },
    });
  }

  listProducts(user: AuthUser) {
    return this.prisma.product.findMany({
      where: this.branchAccess.scope(user),
      include: { inventoryBalances: { include: { warehouse: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...this.branchAccess.scope(user) },
      include: {
        inventoryBalances: { include: { warehouse: true } },
        priceHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async updateProduct(user: AuthUser, id: string, dto: UpdateProductDto) {
    const current = await this.getProduct(user, id);
    const costs = this.calculateCosts({
      purchasePriceYuan:
        dto.purchasePriceYuan === undefined
          ? Number(current.purchasePriceYuan)
          : dto.purchasePriceYuan,
      latestYuanRate:
        dto.latestYuanRate === undefined
          ? Number(current.latestYuanRate)
          : dto.latestYuanRate,
      transportCostKgs:
        dto.transportCostKgs === undefined
          ? Number(current.transportCostKgs)
          : dto.transportCostKgs,
      sellingPriceKgs:
        dto.sellingPriceKgs === undefined
          ? Number(current.sellingPriceKgs)
          : dto.sellingPriceKgs,
    });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          sku: dto.sku,
          category: dto.category,
          photoUrl: dto.photoUrl,
          description: dto.description,
          weightKg: dto.weightKg,
          purchasePriceYuan: dto.purchasePriceYuan,
          latestYuanRate: dto.latestYuanRate,
          transportCostKgs: dto.transportCostKgs,
          finalCostKgs: costs.finalCostKgs,
          sellingPriceKgs: dto.sellingPriceKgs,
          marginPercent: costs.marginPercent,
          minStockLevel: dto.minStockLevel,
        },
      });

      if (
        dto.sellingPriceKgs !== undefined &&
        Number(current.sellingPriceKgs) !== dto.sellingPriceKgs
      ) {
        await tx.productPriceHistory.create({
          data: {
            branchId: current.branchId,
            productId: id,
            oldPriceKgs: current.sellingPriceKgs,
            newPriceKgs: dto.sellingPriceKgs,
          },
        });
      }

      return product;
    });
  }

  createWarehouse(user: AuthUser, dto: WarehouseDto) {
    const branchId = this.branchAccess.resolveBranchId(user, dto.branchId);
    return this.prisma.warehouse.create({
      data: {
        branchId,
        name: dto.name,
        code: dto.code,
      },
    });
  }

  listWarehouses(user: AuthUser) {
    return this.prisma.warehouse.findMany({
      where: this.branchAccess.scope(user),
      orderBy: { name: 'asc' },
    });
  }

  async moveStock(user: AuthUser, dto: StockMovementDto) {
    const [product, warehouse] = await Promise.all([
      this.getProduct(user, dto.productId),
      this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, ...this.branchAccess.scope(user) },
      }),
    ]);

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    this.branchAccess.assertCanAccess(user, product.branchId);
    this.branchAccess.assertCanAccess(user, warehouse.branchId);

    const signedQuantity = this.signedQuantity(dto.type, dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          branchId: product.branchId,
          productId: product.id,
          warehouseId: warehouse.id,
          type: dto.type,
          quantity: dto.quantity,
          unitCost: dto.unitCost ?? product.finalCostKgs,
          note: dto.note,
        },
      });

      const balance = await tx.inventoryBalance.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: warehouse.id,
          },
        },
        update: { quantity: { increment: signedQuantity } },
        create: {
          branchId: product.branchId,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: signedQuantity,
        },
      });

      return { movement, balance };
    });
  }

  async balances(user: AuthUser) {
    return this.prisma.inventoryBalance.findMany({
      where: this.branchAccess.scope(user),
      include: { product: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async lowStock(user: AuthUser) {
    const balances = await this.balances(user);
    return balances.filter(
      (balance) => balance.quantity <= balance.product.minStockLevel,
    );
  }

  async stockValue(user: AuthUser) {
    const balances = await this.balances(user);
    return balances.reduce(
      (acc, balance) => ({
        quantity: acc.quantity + balance.quantity,
        valueKgs:
          acc.valueKgs +
          balance.quantity * Number(balance.product.finalCostKgs),
      }),
      { quantity: 0, valueKgs: 0 },
    );
  }

  createYuanRate(user: AuthUser, dto: YuanRateDto) {
    const branchId = this.branchAccess.resolveBranchId(user, dto.branchId);
    return this.prisma.yuanRateHistory.create({
      data: { branchId, rate: dto.rate },
    });
  }

  private calculateCosts(dto: {
    purchasePriceYuan?: number;
    latestYuanRate?: number;
    transportCostKgs?: number;
    sellingPriceKgs?: number;
  }) {
    const finalCostKgs =
      (dto.purchasePriceYuan ?? 0) * (dto.latestYuanRate ?? 0) +
      (dto.transportCostKgs ?? 0);
    const sellingPriceKgs = dto.sellingPriceKgs ?? 0;
    const marginPercent =
      sellingPriceKgs > 0
        ? ((sellingPriceKgs - finalCostKgs) / sellingPriceKgs) * 100
        : 0;
    return { finalCostKgs, marginPercent };
  }

  private signedQuantity(type: StockMovementType, quantity: number) {
    return ['STOCK_OUT', 'SALE', 'SERVICE'].includes(type) ? -quantity : quantity;
  }
}
