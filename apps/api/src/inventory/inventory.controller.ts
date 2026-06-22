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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER, Role.MASTER, Role.ACCOUNTANT)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('categories')
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  categories(@Query('search') search?: string) {
    return this.inventoryService.categories(search);
  }

  @Post('categories')
  @Roles(Role.OWNER, Role.MANAGER)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('categories/:id')
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  category(@Param('id') id: string) {
    return this.inventoryService.category(id);
  }

  @Put('categories/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.inventoryService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }

  @Post('products')
  @Roles(Role.OWNER, Role.MANAGER)
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user, dto);
  }

  @Post('products/upload-image')
  @Roles(Role.OWNER, Role.MANAGER)
  uploadProductImage(@Req() request: FastifyRequest) {
    return this.inventoryService.uploadProductImage(request);
  }

  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.inventoryService.products(user, query);
  }

  @Get('products/:id')
  product(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.product(user, id);
  }

  @Put('products/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Delete('products/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.deleteProduct(user, id);
  }

  @Post('products/:id/price-history')
  @Roles(Role.OWNER, Role.MANAGER)
  addPriceHistory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreatePriceHistoryDto,
  ) {
    return this.inventoryService.addPriceHistory(user, id, dto);
  }

  @Get('products/:id/price-history')
  priceHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.priceHistory(user, id);
  }

  @Post('yuan-rates')
  @Roles(Role.OWNER, Role.MANAGER)
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
  @Roles(Role.OWNER, Role.MANAGER)
  createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.inventoryService.createWarehouse(user, dto);
  }

  @Get('warehouses')
  warehouses(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.warehouses(user, branchId);
  }

  @Get('warehouses/:id')
  warehouse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.warehouse(user, id);
  }

  @Put('warehouses/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  updateWarehouse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.inventoryService.updateWarehouse(user, id, dto);
  }

  @Post('stock-movements')
  @Roles(Role.OWNER, Role.MANAGER, Role.MASTER)
  createStockMovement(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.inventoryService.createStockMovement(user, dto);
  }

  @Get('stock-movements')
  stockMovements(
    @CurrentUser() user: AuthUser,
    @Query() query: StockMovementQueryDto,
  ) {
    return this.inventoryService.stockMovements(user, query);
  }

  @Get('balances')
  balances(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.inventoryService.balances(user, query);
  }

  @Get('stock-value')
  stockValue(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.stockValue(user, branchId);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.inventoryService.lowStock(user, branchId);
  }
}
