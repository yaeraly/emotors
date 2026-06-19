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
  CreateServiceOrderDto,
  ServiceTaskDto,
  UpdateServiceOrderDto,
  WarrantyDto,
} from './dto';
import { ServiceOrdersService } from './service-orders.service';

@Controller('service')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('SERVICE')
export class ServiceController {
  constructor(private readonly serviceOrders: ServiceOrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceOrderDto) {
    return this.serviceOrders.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.serviceOrders.list(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceOrders.findOne(user, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceOrderDto,
  ) {
    return this.serviceOrders.update(user, id, dto);
  }

  @Post(':id/tasks')
  addTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ServiceTaskDto,
  ) {
    return this.serviceOrders.addTask(user, id, dto);
  }

  @Post(':id/warranties')
  addWarranty(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: WarrantyDto,
  ) {
    return this.serviceOrders.addWarranty(user, id, dto);
  }
}
