import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { PRODUCT_CATALOG_ARCHIVE_ROLES, PRODUCT_CATALOG_MANAGE_ROLES } from '../rbac/rbac';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
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
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('categories')
  @Permissions('inventory.manage', 'inventory.view')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR, Role.SUPPLY_CHAIN_MANAGER)
  categories(@Query('search') search?: string) {
    return this.inventoryService.categories(search);
  }

  @Post('categories')
  @Permissions('inventory.manage')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER, Role.SUPPLY_CHAIN_MANAGER)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('categories/:id')
  @Permissions('inventory.manage', 'inventory.view')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR, Role.SUPPLY_CHAIN_MANAGER)
  category(@Param('id') id: string) {
    return this.inventoryService.category(id);
  }

  @Put('categories/:id')
  @Permissions('inventory.manage')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER, Role.SUPPLY_CHAIN_MANAGER)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.inventoryService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Permissions('inventory.manage')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER, Role.SUPPLY_CHAIN_MANAGER)
  deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }

  @Post('products')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user, dto);
  }

  @Post('products/upload-image')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  uploadProductImage(@Req() request: FastifyRequest) {
    return this.inventoryService.uploadProductImage(request);
  }

  @Get('products')
  @Permissions('products.view')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.MASTER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
    Role.SALESPERSON,
  )
  products(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.inventoryService.products(user, query);
  }

  @Get('products/:id')
  @Permissions('products.view')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.MASTER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
    Role.SALESPERSON,
  )
  product(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.product(user, id);
  }

  @Put('products/:id')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Patch('products/:id')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  patchProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Delete('products/:id')
  @Permissions('products.archive')
  @Roles(...PRODUCT_CATALOG_ARCHIVE_ROLES)
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.deleteProduct(user, id);
  }

  @Post('products/:id/price-history')
  @Permissions('procurement.manage')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  addPriceHistory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreatePriceHistoryDto,
  ) {
    return this.inventoryService.addPriceHistory(user, id, dto);
  }

  @Get('products/:id/price-history')
  @Permissions('products.view')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.SUPPLY_CHAIN_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.FINANCE_MANAGER,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.MASTER,
    Role.WAREHOUSE_OPERATOR,
    Role.CASHIER,
    Role.SALESPERSON,
  )
  priceHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.priceHistory(user, id);
  }

  @Post('yuan-rates')
  @Permissions('procurement.manage')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  createYuanRate(@CurrentUser() user: AuthUser, @Body() dto: CreateYuanRateDto) {
    return this.inventoryService.createYuanRate(user, dto);
  }

  @Get('yuan-rates')
  yuanRates() {
    return this.inventoryService.yuanRates();
  }

  @Get('yuan-rates/latest')
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
  @Permissions('inventory.manage', 'inventory.view', 'products.view')
  @Roles(
    Role.OWNER,
    Role.CEO,
    Role.FRANCHISE_OWNER,
    Role.MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.WAREHOUSE_OPERATOR,
    Role.SUPPLY_CHAIN_MANAGER,
  )
  warehouses(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.warehouses(user, branchId);
  }

  @Get('warehouses/:id')
  @Permissions('inventory.manage', 'inventory.view', 'products.view')
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
  @Permissions('inventory.manage')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  createStockMovement(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.inventoryService.createStockMovement(user, dto);
  }

  @Get('stock-movements')
  @Permissions('inventory.manage', 'inventory.view')
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
  @Permissions('inventory.manage', 'inventory.view')
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
  @Permissions('inventory.manage', 'inventory.view')
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
  @Permissions('inventory.manage', 'inventory.view')
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
