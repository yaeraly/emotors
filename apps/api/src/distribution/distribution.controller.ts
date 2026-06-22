import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { DistributionService } from './distribution.service';

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.MANAGER)
export class DistributionController {
  constructor(private readonly distributionService: DistributionService) {}

  @Post('orders')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.create(user, dto);
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser, @Query() query: DistributionOrderQueryDto) {
    return this.distributionService.list(user, query);
  }

  @Get('orders/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.detail(user, id);
  }

  @Put('orders/:id')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.update(user, id, dto);
  }

  @Post('orders/:id/approve')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.approve(user, id);
  }

  @Post('orders/:id/send')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.send(user, id);
  }

  @Post('orders/:id/cancel')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.cancel(user, id);
  }

  @Post('orders/:id/receive')
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveDistributionOrderDto,
  ) {
    return this.distributionService.receive(user, id, dto);
  }

  @Get('receivings')
  receivings(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.receivings(user, query);
  }

  @Get('receivings/:id')
  receiving(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.receiving(user, id);
  }

  @Get('shortage-reports')
  shortageReports(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.shortageReports(user, query);
  }

  @Get('shortage-reports/:id')
  shortageReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.shortageReport(user, id);
  }

  @Post('shortage-reports/:id/resolve')
  @Roles(Role.OWNER, Role.SUPPLY_CHAIN_MANAGER)
  resolveShortageReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.resolveShortageReport(user, id);
  }
}
