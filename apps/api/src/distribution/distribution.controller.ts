import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddBranchPaymentDto } from './dto/add-branch-payment.dto';
import { BranchInvoiceQueryDto } from './dto/branch-invoice-query.dto';
import { CreateDistributionOrderDto } from './dto/create-distribution-order.dto';
import { DistributionOrderQueryDto } from './dto/distribution-order-query.dto';
import { DistributionReportQueryDto } from './dto/distribution-report-query.dto';
import { PickingTaskQueryDto } from './dto/picking-task-query.dto';
import { ReceiveDistributionOrderDto } from './dto/receive-distribution-order.dto';
import { SaveBranchReceivingDraftRowDto } from './dto/save-branch-receiving-draft-row.dto';
import { ResolveShortageDto } from './dto/resolve-shortage.dto';
import { RejectBranchInstallmentDto, RequestBranchInstallmentDto } from './dto/request-branch-installment.dto';
import { SendToWarehouseDto } from './dto/send-to-warehouse.dto';
import { SendDistributionOrderDto } from './dto/send-distribution-order.dto';
import { SetDistributionOrderItemPickedDto } from './dto/set-distribution-order-item-picked.dto';
import { EnterReceivingTransportDto } from './dto/enter-receiving-transport.dto';
import { DistributionService } from './distribution.service';

const DISTRIBUTION_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.HQ_SALES_MANAGER,
  Role.HQ_CASHIER,
  Role.WAREHOUSE_MANAGER,
  Role.WAREHOUSE_OPERATOR,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
] as const;

const DISTRIBUTION_MANAGE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.HQ_SALES_MANAGER,
] as const;

const DISTRIBUTION_DISPATCH_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.WAREHOUSE_MANAGER,
] as const;

const DISTRIBUTION_INVOICE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FRANCHISE_OWNER,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.HQ_SALES_MANAGER,
  Role.HQ_CASHIER,
  Role.WAREHOUSE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
  Role.FINANCE_MANAGER,
  Role.CASHIER,
] as const;

const DISTRIBUTION_PAYMENT_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FRANCHISE_OWNER,
  Role.HQ_CASHIER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
  Role.FINANCE_MANAGER,
  Role.CASHIER,
] as const;

@Controller('distribution')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributionController {
  constructor(private readonly distributionService: DistributionService) {}

  @Post('orders')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.create(user, dto);
  }

  @Get('orders')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  list(@CurrentUser() user: AuthUser, @Query() query: DistributionOrderQueryDto) {
    return this.distributionService.list(user, query);
  }

  @Get('orders/:id')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.detail(user, id);
  }

  @Put('orders/:id')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDistributionOrderDto) {
    return this.distributionService.update(user, id, dto);
  }

  @Post('orders/:id/approve')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.approve(user, id);
  }

  @Post('orders/:id/send-invoice')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  sendInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.sendInvoice(user, id);
  }

  @Post('orders/:id/send-to-warehouse')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  sendToWarehouse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendToWarehouseDto,
  ) {
    return this.distributionService.sendToWarehouse(user, id, dto);
  }

  @Get('picking-tasks')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  pickingTasks(@CurrentUser() user: AuthUser, @Query() query: PickingTaskQueryDto) {
    return this.distributionService.listPickingTasks(user, query);
  }

  @Get('picking-tasks/:id')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  pickingTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.pickingTask(user, id);
  }

  @Post('orders/:id/pick')
  @Roles(...DISTRIBUTION_DISPATCH_ROLES)
  pick(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.pick(user, id);
  }

  @Post('orders/:id/pack')
  @Roles(...DISTRIBUTION_DISPATCH_ROLES)
  pack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.pack(user, id);
  }

  @Patch('orders/:orderId/items/:itemId/picked')
  @Roles(...DISTRIBUTION_DISPATCH_ROLES)
  setOrderItemPicked(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetDistributionOrderItemPickedDto,
  ) {
    return this.distributionService.setOrderItemPicked(user, orderId, itemId, dto);
  }

  @Post('orders/:id/send')
  @Roles(...DISTRIBUTION_DISPATCH_ROLES)
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendDistributionOrderDto,
  ) {
    return this.distributionService.send(user, id, dto);
  }

  @Post('orders/:id/cancel')
  @Roles(...DISTRIBUTION_MANAGE_ROLES, Role.WAREHOUSE_MANAGER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.cancel(user, id);
  }

  @Post('orders/:id/receive')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveDistributionOrderDto,
  ) {
    return this.distributionService.receive(user, id, dto);
  }

  @Put('orders/:id/receiving-draft-rows/:itemId')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  saveBranchReceivingDraftRow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SaveBranchReceivingDraftRowDto,
  ) {
    return this.distributionService.saveBranchReceivingDraftRow(user, id, itemId, dto);
  }

  @Post('orders/:id/complete')
  @Roles(...DISTRIBUTION_DISPATCH_ROLES)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.complete(user, id);
  }

  @Get('receivings')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  receivings(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.receivings(user, query);
  }

  @Get('receivings/:id')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  receiving(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.receiving(user, id);
  }

  @Get('shortage-reports')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  shortageReports(@CurrentUser() user: AuthUser, @Query() query: DistributionReportQueryDto) {
    return this.distributionService.shortageReports(user, query);
  }

  @Get('shortage-reports/:id')
  @Roles(...DISTRIBUTION_VIEW_ROLES)
  shortageReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.shortageReport(user, id);
  }

  @Post('shortage-reports/:id/resolve')
  @Roles(...DISTRIBUTION_MANAGE_ROLES)
  resolveShortageReport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveShortageDto,
  ) {
    return this.distributionService.resolveShortageReport(user, id, dto);
  }

  @Get('invoices')
  @Roles(...DISTRIBUTION_INVOICE_ROLES)
  invoices(@CurrentUser() user: AuthUser, @Query() query: BranchInvoiceQueryDto) {
    return this.distributionService.invoices(user, query);
  }

  @Get('invoices/:id')
  @Roles(...DISTRIBUTION_INVOICE_ROLES)
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.invoice(user, id);
  }

  @Post('invoices/:id/payments')
  @Roles(...DISTRIBUTION_PAYMENT_ROLES)
  addInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddBranchPaymentDto,
  ) {
    return this.distributionService.addInvoicePayment(user, id, dto);
  }

  @Post('invoices/:invoiceId/payments/:paymentId/confirm')
  @Roles(Role.OWNER, Role.CEO, Role.HQ_CASHIER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER)
  confirmInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.distributionService.confirmInvoicePayment(user, invoiceId, paymentId);
  }

  @Post('invoices/:invoiceId/payments/:paymentId/reject')
  @Roles(Role.OWNER, Role.CEO, Role.HQ_CASHIER, Role.HQ_ACCOUNTANT, Role.FINANCE_MANAGER)
  rejectInvoicePayment(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: { comment: string },
  ) {
    return this.distributionService.rejectInvoicePayment(user, invoiceId, paymentId, dto.comment);
  }

  @Post('invoices/:id/installment')
  @Roles(Role.OWNER, Role.CEO, Role.ACCOUNTANT, Role.FRANCHISE_OWNER)
  requestInvoiceInstallment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestBranchInstallmentDto,
  ) {
    return this.distributionService.requestInvoiceInstallment(user, id, dto);
  }

  @Post('invoices/:id/installment/approve')
  @Roles(Role.OWNER, Role.CEO)
  approveInvoiceInstallment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.approveInvoiceInstallment(user, id);
  }

  @Post('invoices/:id/installment/reject')
  @Roles(Role.OWNER, Role.CEO)
  rejectInvoiceInstallment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectBranchInstallmentDto,
  ) {
    return this.distributionService.rejectInvoiceInstallment(user, id, dto);
  }

  @Post('invoices/:id/send-to-cashier')
  @Roles(Role.OWNER, Role.CEO, Role.ACCOUNTANT, Role.FRANCHISE_OWNER)
  sendInvoiceToCashier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributionService.sendInvoiceToCashier(user, id);
  }

  @Post('orders/:id/transport-cost/preview')
  @Roles(Role.OWNER, Role.CEO)
  previewReceivingTransportCost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EnterReceivingTransportDto,
  ) {
    return this.distributionService.previewReceivingTransportCost(user, id, dto);
  }

  @Post('orders/:id/transport-cost/allocate')
  @Roles(Role.WAREHOUSE_OPERATOR)
  allocateReceivingTransportCost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EnterReceivingTransportDto,
  ) {
    return this.distributionService.allocateReceivingTransportCost(user, id, dto);
  }

  @Post('orders/:id/transport-cost')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_OPERATOR)
  enterReceivingTransportCost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EnterReceivingTransportDto,
  ) {
    return this.distributionService.enterReceivingTransportCost(user, id, dto);
  }

  @Get('branches/:branchId/account-balance')
  @Roles(...DISTRIBUTION_INVOICE_ROLES)
  branchAccountBalance(@CurrentUser() user: AuthUser, @Param('branchId') branchId: string) {
    return this.distributionService.branchAccountBalance(user, branchId);
  }

  @Get('branch-balances')
  @Roles(...DISTRIBUTION_INVOICE_ROLES)
  branchBalances(@CurrentUser() user: AuthUser) {
    return this.distributionService.branchBalances(user);
  }
}
