import { Body, Controller, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PRODUCT_CATALOG_MANAGE_ROLES } from '../rbac/rbac';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InventoryService } from './inventory.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user, dto);
  }

  @Put(':id')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(user, id, dto);
  }

  @Patch(':id')
  @Permissions('products.manage')
  @Roles(...PRODUCT_CATALOG_MANAGE_ROLES)
  patch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(user, id, dto);
  }
}
