import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import {
  BulkUpdateInventoryCountItemsDto,
  CreateInventoryCountDto,
  RejectInventoryCountDto,
  UpdateInventoryCountItemDto,
} from './dto/inventory-count.dto';
import { InventoryCountQueryDto } from './dto/inventory-count-query.dto';
import { InventoryCountService } from './inventory-count.service';

const INVENTORY_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.FRANCHISE_OWNER,
  Role.WAREHOUSE_OPERATOR,
] as const;

const INVENTORY_COUNT_ROLES = [Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR] as const;

@Controller('inventory-count')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryCountController {
  constructor(private readonly service: InventoryCountService) {}

  @Get('sessions')
  @Roles(...INVENTORY_VIEW_ROLES)
  list(@CurrentUser() user: AuthUser, @Query() query: InventoryCountQueryDto) {
    return this.service.list(user, query);
  }

  @Get('sessions/:id')
  @Roles(...INVENTORY_VIEW_ROLES)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Get('sessions/:id/summary')
  @Roles(...INVENTORY_VIEW_ROLES)
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.summary(user, id);
  }

  @Get('search')
  @Roles(...INVENTORY_VIEW_ROLES)
  search(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId') warehouseId: string,
    @Query('q') q: string,
  ) {
    return this.service.search(user, warehouseId, q ?? '');
  }

  @Post('sessions')
  @Roles(...INVENTORY_COUNT_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInventoryCountDto) {
    return this.service.create(user, dto);
  }

  @Post('sessions/:id/start')
  @Roles(...INVENTORY_COUNT_ROLES)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(user, id);
  }

  @Put('sessions/:id/items/:itemId')
  @Roles(...INVENTORY_COUNT_ROLES)
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInventoryCountItemDto,
  ) {
    return this.service.updateItem(user, id, itemId, dto);
  }

  @Put('sessions/:id/items')
  @Roles(...INVENTORY_COUNT_ROLES)
  bulkUpdateItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BulkUpdateInventoryCountItemsDto,
  ) {
    return this.service.bulkUpdateItems(user, id, dto);
  }

  @Post('sessions/:id/submit')
  @Roles(...INVENTORY_COUNT_ROLES)
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post('sessions/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post('sessions/:id/reject')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectInventoryCountDto,
  ) {
    return this.service.reject(user, id, dto);
  }
}
