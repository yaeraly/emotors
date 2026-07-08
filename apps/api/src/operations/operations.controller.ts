import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BranchPurchaseRequestStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { OperationsService } from './operations.service';
import { NotificationQueryDto } from '../notifications/dto/notification-query.dto';
import { ProcurementDifferenceActQueryDto } from './dto/procurement-difference-act-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('branch-purchase-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.SUPPLY_CHAIN_MANAGER, Role.HQ_SALES_MANAGER, Role.WAREHOUSE_MANAGER)
  branchPurchaseRequests(@CurrentUser() user: AuthUser) {
    return this.service.branchPurchaseRequests(user);
  }

  @Get('branch-purchase-requests/product-options')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.SUPPLY_CHAIN_MANAGER, Role.HQ_SALES_MANAGER, Role.WAREHOUSE_MANAGER)
  branchProductOptions(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('branchWarehouseId') branchWarehouseId?: string,
    @Query('includeStock') includeStock?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.branchProductOptions(user, search, branchWarehouseId, includeStock, branchId);
  }

  @Get('branch-purchase-requests/product-prices')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.SUPPLY_CHAIN_MANAGER, Role.HQ_SALES_MANAGER, Role.WAREHOUSE_MANAGER)
  branchProductPrices(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId: string,
    @Query('productIds') productIds?: string,
  ) {
    const ids = productIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
    return this.service.branchProductPrices(user, branchId, ids);
  }

  @Get('branch-purchase-requests/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.SUPPLY_CHAIN_MANAGER, Role.HQ_SALES_MANAGER, Role.WAREHOUSE_MANAGER)
  branchPurchaseRequestById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.branchPurchaseRequestById(user, id);
  }

  @Post('branch-purchase-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  createBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createBranchPurchaseRequest(user, dto);
  }

  @Put('branch-purchase-requests/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  updateBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateBranchPurchaseRequest(user, id, dto);
  }

  @Post('branch-purchase-requests/:id/submit')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  submitBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submitBranchPurchaseRequest(user, id);
  }

  @Post('branch-purchase-requests/:id/cancel')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.MANAGER)
  cancelBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelBranchPurchaseRequest(user, id);
  }

  @Post('audit/forbidden-route')
  logForbiddenRoute(@CurrentUser() user: AuthUser, @Body() body: { pathname: string }) {
    return this.service.logForbiddenRouteAccess(user, body.pathname);
  }

  @Post('audit/branch-sales-manager-menu')
  logBranchSalesManagerMenu(@CurrentUser() user: AuthUser) {
    return this.service.logBranchSalesManagerMenuUpdated(user);
  }

  @Post('branch-purchase-requests/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.HQ_SALES_MANAGER)
  approveBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.reviewBranchPurchaseRequest(user, id, BranchPurchaseRequestStatus.APPROVED, dto);
  }

  @Post('branch-purchase-requests/:id/reject')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.HQ_SALES_MANAGER)
  rejectBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reviewBranchPurchaseRequest(user, id, BranchPurchaseRequestStatus.REJECTED);
  }

  @Get('branch-product-shortages')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR)
  branchProductShortages(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
    @Query('assignedHqWarehouseId') assignedHqWarehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.branchProductShortages(user, {
      branchId,
      productId,
      assignedHqWarehouseId,
      ...(status ? { status: status as any } : {}),
    });
  }

  @Post('branch-product-shortages/:id/review')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR)
  reviewBranchProductShortage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.reviewBranchProductShortage(user, id, dto);
  }

  @Post('branch-product-shortages/:id/link-procurement')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR)
  linkBranchShortageToProcurement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.linkBranchShortageToProcurement(user, id, dto);
  }

  @Post('branch-purchase-requests/:id/send-to-hq-warehouse')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.HQ_SALES_MANAGER)
  sendBranchRequestToHqWarehouse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.routeBranchRequestToHqWarehouse(user, id, dto);
  }

  @Post('branch-purchase-requests/:id/convert')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.HQ_SALES_MANAGER)
  convertBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.convertBranchPurchaseRequest(user, id, dto);
  }

  @Get('procurement/hq-receivings')
  @RequirePermissions('procurement.manage', 'procurement.view', 'procurement.receive')
  procurementReceivings() {
    return this.service.procurementReceivings();
  }

  @Get('procurement/china-receiving')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  listChinaReceivingTasks(@CurrentUser() user: AuthUser) {
    return this.service.listChinaReceivingTasks(user);
  }

  @Get('procurement/china-receiving/difference-acts')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  listChinaReceivingDifferenceActs(@CurrentUser() user: AuthUser, @Query() query: ProcurementDifferenceActQueryDto) {
    return this.service.listChinaReceivingDifferenceActs(user, query);
  }

  @Get('procurement/difference-acts')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  listProcurementDifferenceActs(@CurrentUser() user: AuthUser, @Query() query: ProcurementDifferenceActQueryDto) {
    return this.service.listChinaReceivingDifferenceActs(user, query);
  }

  @Get('procurement/difference-acts/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  getProcurementDifferenceAct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getProcurementDifferenceAct(user, id);
  }

  @Post('procurement/difference-acts/:id/archive')
  @Roles(Role.OWNER, Role.CEO)
  @RequirePermissions('procurement.manage')
  archiveDifferenceAct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveDifferenceAct(user, id);
  }

  @Get('procurement/china-receiving/:orderId')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  getChinaReceivingTask(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.service.getChinaReceivingTask(user, orderId);
  }

  @Post('procurement/china-receiving/:orderId/difference-acts')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive')
  createReceivingDifferenceActs(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: any,
  ) {
    return this.service.createReceivingDifferenceActs(user, orderId, dto);
  }

  @Post('procurement/china-receiving/:orderId/mark-arrival')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive')
  markChinaReceivingArrival(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: any,
  ) {
    return this.service.markChinaReceivingArrival(user, orderId, dto);
  }

  @Get('procurement/china-receiving/:orderId/difference-acts')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive', 'procurement.view', 'procurement.manage')
  listOrderChinaReceivingDifferenceActs(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.service.listChinaReceivingDifferenceActs(user, { orderId });
  }

  @Post('procurement/orders/:id/receive-to-hq')
  @Roles(Role.OWNER, Role.CEO, Role.WAREHOUSE_MANAGER)
  @RequirePermissions('procurement.receive')
  receiveProcurementToHq(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.receiveProcurementToHq(user, id, dto);
  }

  @Get('reservations')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  reservations(@CurrentUser() user: AuthUser) {
    return this.service.reservations(user);
  }

  @Post('reservations')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  createReservation(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createReservation(user, dto);
  }

  @Put('reservations/:id/status')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  updateReservationStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateReservationStatus(user, id, dto.status);
  }

  @Get('warehouse-release')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  warehouseReleaseOrders(@CurrentUser() user: AuthUser) {
    return this.service.warehouseReleaseOrders(user);
  }

  @Post('warehouse-release')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  createWarehouseReleaseOrder(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createWarehouseReleaseOrder(user, dto);
  }

  @Post('warehouse-release/:id/release')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER)
  releaseWarehouseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.releaseWarehouseOrder(user, id);
  }

  @Get('parts-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MASTER, Role.WAREHOUSE_OPERATOR)
  partsRequests(@CurrentUser() user: AuthUser) {
    return this.service.partsRequests(user);
  }

  @Post('parts-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MASTER)
  createPartsRequest(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createPartsRequest(user, dto);
  }

  @Get('returns')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.CASHIER)
  returns(@CurrentUser() user: AuthUser) {
    return this.service.returns(user);
  }

  @Post('returns')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  createReturn(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createReturn(user, dto);
  }

  @Post('returns/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  approveReturn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.approveReturn(user, id, dto);
  }

  @Post('returns/:id/close')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.CASHIER)
  closeReturn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.closeReturn(user, id, dto);
  }

  @Get('warranty/claims')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MASTER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  warrantyClaims(@CurrentUser() user: AuthUser) {
    return this.service.warrantyClaims(user);
  }

  @Post('warranty/claims')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MASTER)
  createWarrantyClaim(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createWarrantyClaim(user, dto);
  }

  @Put('warranty/claims/:id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MASTER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  updateWarrantyClaim(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateWarrantyClaim(user, id, dto);
  }

  @Get('supplier-claims')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  supplierClaims() {
    return this.service.supplierClaims();
  }

  @Post('supplier-claims')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  createSupplierClaim(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createSupplierClaim(user, dto);
  }

  @Get('alerts')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.MASTER, Role.WAREHOUSE_OPERATOR, Role.CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT, Role.HQ_ACCOUNTANT)
  alerts(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.service.alerts(user, query);
  }

  @Get('alerts/unread-count')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.MASTER, Role.WAREHOUSE_OPERATOR, Role.CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT, Role.HQ_ACCOUNTANT)
  unreadAlertCount(@CurrentUser() user: AuthUser) {
    return this.service.unreadAlertCount(user);
  }

  @Post('alerts')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER)
  createAlert(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createAlert(user, dto);
  }

  @Post('alerts/:id/read')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.MASTER, Role.WAREHOUSE_OPERATOR, Role.CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT, Role.HQ_ACCOUNTANT)
  markAlertRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markAlertRead(user, id);
  }

  @Post('alerts/:id/archive')
  @Roles(Role.OWNER, Role.CEO)
  archiveAlert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveAlert(user, id);
  }

  @Get('operations/analytics')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT, Role.HQ_ACCOUNTANT)
  analyticsPlaceholders() {
    return this.service.analyticsPlaceholders();
  }
}
