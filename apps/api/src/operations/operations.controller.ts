import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BranchPurchaseRequestStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { OperationsService } from './operations.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('branch-purchase-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  branchPurchaseRequests(@CurrentUser() user: AuthUser) {
    return this.service.branchPurchaseRequests(user);
  }

  @Post('branch-purchase-requests')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  createBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createBranchPurchaseRequest(user, dto);
  }

  @Post('branch-purchase-requests/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  approveBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reviewBranchPurchaseRequest(user, id, BranchPurchaseRequestStatus.APPROVED);
  }

  @Post('branch-purchase-requests/:id/reject')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  rejectBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reviewBranchPurchaseRequest(user, id, BranchPurchaseRequestStatus.REJECTED);
  }

  @Post('branch-purchase-requests/:id/convert')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER)
  convertBranchPurchaseRequest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.convertBranchPurchaseRequest(user, id, dto);
  }

  @Get('procurement/hq-receivings')
  @RequirePermissions('procurement.manage', 'procurement.view', 'procurement.receive')
  procurementReceivings() {
    return this.service.procurementReceivings();
  }

  @Post('procurement/orders/:id/receive-to-hq')
  @RequirePermissions('procurement.receive', 'procurement.manage')
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
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.MASTER, Role.WAREHOUSE_OPERATOR, Role.CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT)
  alerts(@CurrentUser() user: AuthUser) {
    return this.service.alerts(user);
  }

  @Post('alerts')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER)
  createAlert(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createAlert(user, dto);
  }

  @Post('alerts/:id/read')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER, Role.MASTER, Role.WAREHOUSE_OPERATOR, Role.CASHIER, Role.SUPPLY_CHAIN_MANAGER, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT)
  markAlertRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markAlertRead(user, id);
  }

  @Get('operations/analytics')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.SUPPLY_CHAIN_MANAGER, Role.FINANCE_MANAGER, Role.ACCOUNTANT)
  analyticsPlaceholders() {
    return this.service.analyticsPlaceholders();
  }
}
