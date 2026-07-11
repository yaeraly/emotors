import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePriceHistoryDto } from './dto/create-price-history.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateYuanRateDto } from './dto/create-yuan-rate.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { SuggestProductCodeQueryDto, ValidateProductCodeQueryDto } from './dto/suggest-product-code.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdatePurchasePriceDto } from './dto/update-purchase-price.dto';
import { PurchasePriceHistoryQueryDto } from './dto/purchase-price-history-query.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { InventoryService } from './inventory.service';

const PRODUCT_VIEW_PERMISSIONS = [
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.manage',
] as const;

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('categories')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  categories(@Query('search') search?: string) {
    return this.inventoryService.categories(search);
  }

  @Post('categories')
  @RequirePermissions('products.manage')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(user, dto);
  }

  @Post('categories/create-opened')
  @RequirePermissions('products.manage')
  logCategoryCreateOpened(@CurrentUser() user: AuthUser) {
    return this.inventoryService.logCategoryCreateOpened(user);
  }

  @Get('categories/:id')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  category(@Param('id') id: string) {
    return this.inventoryService.category(id);
  }

  @Put('categories/:id')
  @RequirePermissions('products.manage')
  updateCategory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.inventoryService.updateCategory(user, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('products.archive')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.deleteCategory(user, id);
  }

  @Post('products')
  @RequirePermissions('products.manage')
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user, dto);
  }

  @Get('products/suggest-code')
  @RequirePermissions('products.manage')
  suggestProductCode(@CurrentUser() user: AuthUser, @Query() query: SuggestProductCodeQueryDto) {
    return this.inventoryService.suggestProductCode(user, query.categoryId, query.branchId);
  }

  @Get('products/validate-code')
  @RequirePermissions('products.manage')
  validateProductCode(@CurrentUser() user: AuthUser, @Query() query: ValidateProductCodeQueryDto) {
    return this.inventoryService.validateProductCode(
      user,
      query.sku,
      query.branchId,
      query.excludeProductId,
    );
  }

  @Post('products/upload-image')
  @RequirePermissions('products.manage')
  uploadProductImage(@Req() request: FastifyRequest) {
    return this.inventoryService.uploadProductImage(request);
  }

  @Get('products')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  products(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.inventoryService.products(user, query);
  }

  @Get('products/:id')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  product(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.product(user, id);
  }

  @Put('products/:id')
  @RequirePermissions('products.manage')
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Delete('products/:id')
  @RequirePermissions('products.archive')
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.deleteProduct(user, id);
  }

  @Post('products/:id/price-history')
  @RequirePermissions('products.manage')
  addPriceHistory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreatePriceHistoryDto,
  ) {
    return this.inventoryService.addPriceHistory(user, id, dto);
  }

  @Get('products/:id/price-history')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  priceHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.priceHistory(user, id);
  }

  @Get('products/:id/purchase-price-history')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  purchasePriceHistoryForProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.purchasePriceHistoryForProduct(user, id);
  }

  @Put('products/:id/purchase-price')
  @RequirePermissions('products.manage')
  updatePurchasePrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePriceDto,
  ) {
    return this.inventoryService.updatePurchasePriceYuan(user, id, dto);
  }

  @Get('purchase-price-history')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS, 'reports.view')
  purchasePriceHistoryReport(
    @CurrentUser() user: AuthUser,
    @Query() query: PurchasePriceHistoryQueryDto,
  ) {
    return this.inventoryService.purchasePriceHistoryReport(user, query);
  }

  @Post('yuan-rates')
  @RequirePermissions('products.manage')
  createYuanRate(@CurrentUser() user: AuthUser, @Body() dto: CreateYuanRateDto) {
    return this.inventoryService.createYuanRate(user, dto);
  }

  @Get('yuan-rates')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  yuanRates() {
    return this.inventoryService.yuanRates();
  }

  @Get('yuan-rates/latest')
  @RequirePermissions(...PRODUCT_VIEW_PERMISSIONS)
  latestYuanRate() {
    return this.inventoryService.latestYuanRate();
  }

  @Post('warehouses')
  @Roles(Role.OWNER, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR)
  createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.inventoryService.createWarehouse(user, dto);
  }

  @Get('warehouses')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  warehouses(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('warehouseType') warehouseType?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('isHq') isHq?: string,
  ) {
    const resolvedType = warehouseType ?? type ?? (isHq === 'true' ? 'HQ' : isHq === 'false' ? 'BRANCH' : undefined);
    return this.inventoryService.warehouses(user, branchId, resolvedType, status);
  }

  @Get('warehouses/:id')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  warehouse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.warehouse(user, id);
  }

  @Put('warehouses/:id')
  @Roles(Role.OWNER, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR)
  updateWarehouse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.inventoryService.updateWarehouse(user, id, dto);
  }

  @Post('stock-movements')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  createStockMovement(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.inventoryService.createStockMovement(user, dto);
  }

  @Get('stock-movements')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  stockMovements(
    @CurrentUser() user: AuthUser,
    @Query() query: StockMovementQueryDto,
  ) {
    return this.inventoryService.stockMovements(user, query);
  }

  @Get('balances')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  balances(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.inventoryService.balances(user, query);
  }

  @Get('stock-value')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  stockValue(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.stockValue(user, branchId);
  }

  @Get('low-stock')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  lowStock(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.lowStock(user, branchId);
  }
}
