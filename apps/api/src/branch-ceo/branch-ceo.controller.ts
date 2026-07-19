import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductQueryDto } from '../inventory/dto/product-query.dto';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchCeoService } from './branch-ceo.service';
import { UpdateBranchCeoWarehouseDto } from './dto/update-branch-ceo-warehouse.dto';

const BRANCH_CEO_ROLES = [Role.FRANCHISE_OWNER] as const;

@Controller('branch-ceo')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchCeoController {
  constructor(private readonly service: BranchCeoService) {}

  @Get('product-directory')
  @Roles(...BRANCH_CEO_ROLES)
  productDirectory(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.service.productDirectory(user, query);
  }

  @Get('product-directory/:id')
  @Roles(...BRANCH_CEO_ROLES)
  productDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.productDetail(user, id);
  }

  @Get('warehouse')
  @Roles(...BRANCH_CEO_ROLES)
  warehouseOverview(@CurrentUser() user: AuthUser) {
    return this.service.warehouseOverview(user);
  }

  @Get('warehouse/:warehouseId/products')
  @Roles(...BRANCH_CEO_ROLES)
  warehouseProducts(
    @CurrentUser() user: AuthUser,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.service.warehouseProducts(user, warehouseId);
  }

  @Patch('warehouse')
  @Roles(...BRANCH_CEO_ROLES)
  updateWarehouse(@CurrentUser() user: AuthUser, @Body() dto: UpdateBranchCeoWarehouseDto) {
    return this.service.updateWarehouse(user, dto);
  }
}
