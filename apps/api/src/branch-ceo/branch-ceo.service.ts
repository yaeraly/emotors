import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { BranchWarehouseService } from '../branch-warehouse/branch-warehouse.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductQueryDto } from '../inventory/dto/product-query.dto';
import { isBranchOwnerUser } from '../rbac/rbac';
import {
  sanitizeBranchCeoProductDetail,
  sanitizeBranchCeoProductRow,
} from './branch-ceo-product.presenter';
import { UpdateBranchCeoWarehouseDto } from './dto/update-branch-ceo-warehouse.dto';

@Injectable()
export class BranchCeoService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly branchWarehouseService: BranchWarehouseService,
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
    const result = await this.inventoryService.products(user, query);
    return {
      ...result,
      items: result.items.map((product) => sanitizeBranchCeoProductRow(product)),
    };
  }

  async productDetail(user: AuthUser, id: string) {
    this.assertBranchCeo(user);
    const product = await this.inventoryService.product(user, id);
    return sanitizeBranchCeoProductDetail(product);
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
    return products.map((product) => {
      const { supplierName, sellingPriceKgs, finalCostKgs, ...rest } = product as Record<string, unknown>;
      return rest;
    });
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
