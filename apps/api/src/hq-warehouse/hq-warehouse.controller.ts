import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CreateHqWarehouseDto } from './dto/create-hq-warehouse.dto';
import { UpdateHqWarehouseDto } from './dto/update-hq-warehouse.dto';
import { DeleteArchiveDto } from '../common/dto/delete-archive.dto';
import { HqWarehouseService } from './hq-warehouse.service';

@Controller('hq-warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
export class HqWarehouseController {
  constructor(private readonly service: HqWarehouseService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.service.dashboard(user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHqWarehouseDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Put(':id')
  @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHqWarehouseDto) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/deactivate')
  @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deactivate(user, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeleteArchiveDto,
  ) {
    return this.service.remove(user, id, dto?.reason);
  }

  @Get(':id/inventory')
  inventory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.inventory(user, id);
  }

  @Get(':id/receivings')
  receivings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.receivings(user, id);
  }

  @Delete(':id/receivings/:receivingId')
  @Roles(Role.CEO)
  deleteReceiving(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('receivingId') receivingId: string,
    @Body() dto: DeleteArchiveDto,
  ) {
    return this.service.deleteReceiving(user, id, receivingId, dto?.reason);
  }

  @Get(':id/transfers')
  transfers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.transfers(user, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.history(user, id);
  }
}
