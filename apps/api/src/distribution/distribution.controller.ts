import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { DistributionService } from './distribution.service';

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('distribution.manage', 'finance.view', 'payments.manage')
@Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR, Role.FRANCHISE_OWNER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
export class DistributionController {
  constructor(private readonly distributionService: DistributionService) {}

  @Post('orders')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.create(user, dto);
  }

  @Get('orders')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  list(@CurrentUser() user: AuthUser, @Query() query: DistributionOrderQueryDto) {
    return this.distributionService.list(user, query);
  }

  @Get('orders/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.detail(user, id);
  }

  @Put('orders/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.update(user, id, dto);
  }

  @Post('orders/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.approve(user, id);
  }

  @Post('orders/:id/send')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.send(user, id);
  }

  @Post('orders/:id/cancel')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.cancel(user, id);
  }

  @Post('orders/:id/receive')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveDistributionOrderDto,
  ) {
    return this.distributionService.receive(user, id, dto);
  }

  @Get('receivings')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  receivings(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.receivings(user, query);
  }

  @Get('receivings/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  receiving(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.receiving(user, id);
  }

  @Get('shortage-reports')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  shortageReports(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.shortageReports(user, query);
  }

  @Get('shortage-reports/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.WAREHOUSE_OPERATOR)
  shortageReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.shortageReport(user, id);
  }

  @Post('shortage-reports/:id/resolve')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  resolveShortageReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.resolveShortageReport(user, id);
  }

  @Get('invoices')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
  invoices(@CurrentUser() user: AuthUser, @Query() query: BranchInvoiceQueryDto) {
    return this.distributionService.invoices(user, query);
  }

  @Get('invoices/:id')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.invoice(user, id);
  }

  @Post('invoices/:id/payments')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
  addInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddBranchPaymentDto,
  ) {
    return this.distributionService.addInvoicePayment(user, id, dto);
  }

  @Get('branches/:branchId/account-balance')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
  branchAccountBalance(@CurrentUser() user: AuthUser, @Param('branchId') branchId: string) {
    return this.distributionService.branchAccountBalance(user, branchId);
  }

  @Get('branch-balances')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.ACCOUNTANT, Role.FINANCE_MANAGER, Role.CASHIER)
  branchBalances(@CurrentUser() user: AuthUser) {
    return this.distributionService.branchBalances(user);
  }
}
