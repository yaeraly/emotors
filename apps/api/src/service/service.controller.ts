import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { AddPartsDto } from './dto/add-parts.dto';
import { AddRepairDto } from './dto/add-repair.dto';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ServiceService } from './service.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER, Role.MASTER, Role.ACCOUNTANT, Role.SALESPERSON)
@Controller()
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Post('service-orders')
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceOrderDto) {
    return this.serviceService.create(user, dto);
  }

  @Get('service-orders')
  list(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.list(user, branchId);
  }

  @Get('service-orders/masters')
  masters(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.masters(user, branchId);
  }

  @Get('service-orders/reports/daily')
  dailyReport(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.dailyReport(user, branchId);
  }

  @Get('service-orders/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.detail(user, id);
  }

  @Put('service-orders/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<CreateServiceOrderDto>) {
    return this.serviceService.update(user, id, dto);
  }

  @Post('service-orders/:id/diagnosis')
  @Roles(Role.OWNER, Role.MANAGER, Role.MASTER)
  addDiagnosis(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddDiagnosisDto) {
    return this.serviceService.addDiagnosis(user, id, dto);
  }

  @Post('service-orders/:id/repairs')
  @Roles(Role.OWNER, Role.MANAGER, Role.MASTER)
  addRepair(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddRepairDto) {
    return this.serviceService.addRepair(user, id, dto);
  }

  @Post('service-orders/:id/parts')
  @Roles(Role.OWNER, Role.MANAGER, Role.MASTER)
  addParts(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPartsDto) {
    return this.serviceService.addParts(user, id, dto);
  }

  @Post('service-orders/:id/complete')
  @Roles(Role.OWNER, Role.MANAGER, Role.MASTER)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteServiceOrderDto) {
    return this.serviceService.complete(user, id, dto);
  }

  @Post('service-orders/:id/cancel')
  @Roles(Role.OWNER, Role.MANAGER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.cancel(user, id);
  }

  @Get('warranties')
  warranties(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.serviceService.warranties(user, branchId);
  }

  @Get('warranties/:id')
  warranty(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceService.warranty(user, id);
  }
}
