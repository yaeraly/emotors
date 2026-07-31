import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchWarehouseService } from './branch-warehouse.service';
import { UpdateBranchWarehouseDto } from './dto/update-branch-warehouse.dto';

const BRANCH_WAREHOUSE_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.FRANCHISE_OWNER,
  Role.WAREHOUSE_OPERATOR,
  Role.MANAGER,
] as const;

@Controller('branch-warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchWarehouseController {
  constructor(private readonly service: BranchWarehouseService) {}

  @Get('dashboard')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user);
  }

  @Get()
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get(':id')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Put(':id')
  @Roles(Role.CEO, Role.OWNER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchWarehouseDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.CEO)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto?: { reason?: string },
  ) {
    return this.service.remove(user, id, dto?.reason);
  }

  @Get(':id/inventory')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  inventory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.inventory(user, id);
  }

  @Get(':id/products')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  products(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.products(user, id);
  }

  @Get(':id/receivings')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  receivings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.receivings(user, id);
  }

  @Get(':id/distribution')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  distribution(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.distribution(user, id);
  }

  @Get(':id/inventory-history')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  inventoryHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.inventoryHistory(user, id);
  }

  @Get(':id/movements')
  @Roles(...BRANCH_WAREHOUSE_VIEW_ROLES)
  movements(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.movements(user, id);
  }
}
