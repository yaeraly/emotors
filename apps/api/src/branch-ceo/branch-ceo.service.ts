import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { BranchWarehouseService } from '../branch-warehouse/branch-warehouse.service';
import {
  resolveBranchProductCatalogCostsForProducts,
  resolveBranchWarehouseIdForCatalog,
} from '../inventory/branch-product-catalog-cost.util';
import { InventoryService } from '../inventory/inventory.service';
import { ProductQueryDto } from '../inventory/dto/product-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { isBranchOwnerUser } from '../rbac/rbac';
import {
  sanitizeBranchCeoProductDetail,
  sanitizeBranchCeoProductRow,
} from './branch-ceo-product.presenter';
import { sanitizeBranchCeoStockRow } from './branch-ceo-warehouse.presenter';
import { UpdateBranchCeoWarehouseDto } from './dto/update-branch-ceo-warehouse.dto';

@Injectable()
export class BranchCeoService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly branchWarehouseService: BranchWarehouseService,
    private readonly prisma: PrismaService,
  ) {}

  private assertBranchCeo(user: AuthUser) {
    if (!isBranchOwnerUser(user)) {
      throw new ForbiddenException('Доступ только для Branch CEO');
    }
    if (!user.branchId) {
      throw new ForbiddenException('Branch is required');
    }
  }

  async productDirectory(user: AuthUser, query: ProductQueryDto) {
    this.assertBranchCeo(user);
    const branchId = user.branchId!;
    const warehouseId = await resolveBranchWarehouseIdForCatalog(this.prisma, branchId);
    const result = await this.inventoryService.products(user, query);
    const costByProductId = warehouseId
      ? await resolveBranchProductCatalogCostsForProducts(this.prisma, {
          productIds: result.items.map((product) => product.id),
          warehouseId,
        })
      : new Map<string, never>();

    return {
      ...result,
      items: result.items.map((product) => {
        const branchCost = costByProductId.get(product.id);
        return sanitizeBranchCeoProductRow({
          ...product,
          currentBranchInventoryCost: branchCost?.currentBranchInventoryCost ?? null,
          branchInventoryCostAvailable: branchCost?.branchInventoryCostAvailable ?? false,
        });
      }),
    };
  }

  async productDetail(user: AuthUser, id: string) {
    this.assertBranchCeo(user);
    const branchId = user.branchId!;
    const warehouseId = await resolveBranchWarehouseIdForCatalog(this.prisma, branchId);
    const product = await this.inventoryService.product(user, id);
    const branchCost = warehouseId
      ? (
          await resolveBranchProductCatalogCostsForProducts(this.prisma, {
            productIds: [product.id],
            warehouseId,
          })
        ).get(product.id)
      : undefined;

    return sanitizeBranchCeoProductDetail({
      ...product,
      currentBranchInventoryCost: branchCost?.currentBranchInventoryCost ?? null,
      branchInventoryCostAvailable: branchCost?.branchInventoryCostAvailable ?? false,
    });
  }

  async warehouseOverview(user: AuthUser) {
    this.assertBranchCeo(user);
    const warehouses = await this.branchWarehouseService.list(user);
    if (!warehouses.length) {
      throw new NotFoundException('Для вашего филиала склад не настроен');
    }
    const warehouse = warehouses[0];
    const detail = await this.branchWarehouseService.detail(user, warehouse.id);
    return {
      ...detail,
      permissions: {
        canEdit: true,
        readOnly: false,
      },
    };
  }

  async warehouseProducts(user: AuthUser, warehouseId: string) {
    this.assertBranchCeo(user);
    const products = await this.branchWarehouseService.products(user, warehouseId);
    return products.map((product) => sanitizeBranchCeoStockRow(product as Parameters<typeof sanitizeBranchCeoStockRow>[0]));
  }

  async updateWarehouse(user: AuthUser, dto: UpdateBranchCeoWarehouseDto) {
    this.assertBranchCeo(user);
    const warehouses = await this.branchWarehouseService.list(user);
    if (!warehouses.length) {
      throw new NotFoundException('Для вашего филиала склад не настроен');
    }
    const warehouse = warehouses[0];
    if (warehouse.branchId !== user.branchId) {
      throw new ForbiddenException('У вас нет доступа к складу другого филиала');
    }
    return this.branchWarehouseService.updateBranchCeoProfile(user, warehouse.id, dto);
  }
}
