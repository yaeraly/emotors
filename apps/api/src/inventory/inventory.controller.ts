import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import {
  CreateProductDto,
  StockMovementDto,
  UpdateProductDto,
  WarehouseDto,
  YuanRateDto,
} from './dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('INVENTORY')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('products')
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user, dto);
  }

  @Get('products')
  listProducts(@CurrentUser() user: AuthUser) {
    return this.inventoryService.listProducts(user);
  }

  @Get('products/:id')
  getProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventoryService.getProduct(user, id);
  }

  @Put('products/:id')
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Post('warehouses')
  createWarehouse(@CurrentUser() user: AuthUser, @Body() dto: WarehouseDto) {
    return this.inventoryService.createWarehouse(user, dto);
  }

  @Get('warehouses')
  listWarehouses(@CurrentUser() user: AuthUser) {
    return this.inventoryService.listWarehouses(user);
  }

  @Post('stock-movements')
  moveStock(@CurrentUser() user: AuthUser, @Body() dto: StockMovementDto) {
    return this.inventoryService.moveStock(user, dto);
  }

  @Get('balances')
  balances(@CurrentUser() user: AuthUser) {
    return this.inventoryService.balances(user);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.inventoryService.lowStock(user);
  }

  @Get('stock-value')
  stockValue(@CurrentUser() user: AuthUser) {
    return this.inventoryService.stockValue(user);
  }

  @Post('yuan-rates')
  createYuanRate(@CurrentUser() user: AuthUser, @Body() dto: YuanRateDto) {
    return this.inventoryService.createYuanRate(user, dto);
  }
}
