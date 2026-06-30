import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { LandedCostAllocationMethod, ProcurementOrderStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

const PROCUREMENT_ROLES = [Role.OWNER, Role.CEO, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER] as const;
const STATUS_ROLES = [Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER] as const;

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Post('suppliers')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  createSupplier(@Body() dto: any) {
    return this.service.createSupplier(dto);
  }

  @Get('suppliers')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  suppliers() {
    return this.service.suppliers();
  }

  @Get('suppliers/:id')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  supplier(@Param('id') id: string) {
    return this.service.supplier(id);
  }

  @Put('suppliers/:id')
  @Permissions('procurement.manage')
  @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateSupplier(user, id, dto);
  }

  @Delete('suppliers/:id')
  @Permissions('procurement.manage')
  @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.deleteSupplier(user, id, dto?.reason);
  }

  @Post('suppliers/:id/contacts')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  createSupplierContact(@Param('id') id: string, @Body() dto: any) {
    return this.service.createSupplierContact(id, dto);
  }

  @Get('suppliers/:id/contacts')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  supplierContacts(@Param('id') id: string) {
    return this.service.supplierContacts(id);
  }

  @Put('contacts/:id')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateSupplierContact(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateSupplierContact(id, dto);
  }

  @Delete('contacts/:id')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  deleteSupplierContact(@Param('id') id: string) {
    return this.service.deleteSupplierContact(id);
  }

  @Post('factories')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  createFactory(@Body() dto: any) {
    return this.service.createFactory(dto);
  }

  @Get('factories')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  factories() {
    return this.service.factories();
  }

  @Get('factories/:id')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  factory(@Param('id') id: string) {
    return this.service.factory(id);
  }

  @Put('factories/:id')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateFactory(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateFactory(id, dto);
  }

  @Delete('factories/:id')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  deleteFactory(@Param('id') id: string) {
    return this.service.deleteFactory(id);
  }

  @Get('products/:productId/master-data')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  productMasterData(@Param('productId') productId: string) {
    return this.service.productMasterData(productId);
  }

  @Put('orders/:id/exchange-rate')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateExchangeRate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { exchangeRate: number; reason?: string },
  ) {
    return this.service.updateProcurementOrder(user, id, dto);
  }

  @Get('orders')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  procurementOrders() {
    return this.service.procurementOrders();
  }

  @Get('orders/:id')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  procurementOrder(@Param('id') id: string) {
    return this.service.procurementOrder(id);
  }

  @Get('orders/:id/history')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  procurementOrderHistory(@Param('id') id: string) {
    return this.service.procurementOrderHistory(id);
  }

  @Put('orders/:id')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateProcurementOrder(user, id, dto);
  }

  @Put('orders/:id/transport-costs')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateTransportCosts(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateProcurementTransportCosts(user, id, dto);
  }

  @Put('orders/:id/allocation-method')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateAllocationMethod(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { allocationMethod: LandedCostAllocationMethod; reason?: string },
  ) {
    return this.service.updateAllocationMethod(user, id, dto.allocationMethod, dto.reason);
  }

  @Post('orders/:id/recalculate-landed-cost')
  @Permissions('procurement.manage')
  @Roles(Role.OWNER, Role.CEO, Role.SUPPLY_CHAIN_MANAGER)
  recalculate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.recalculateLandedCost(user, id);
  }

  @Put('orders/:id/items/:itemId')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: any,
  ) {
    return this.service.updateProcurementItem(user, id, itemId, dto);
  }

  @Post('orders/:id/items')
  @Permissions('procurement.manage')
  @Roles(...PROCUREMENT_ROLES)
  addItems(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.addProcurementOrderItems(user, id, dto);
  }

  @Post('orders/:id/status')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status: ProcurementOrderStatus; reason?: string },
  ) {
    return this.service.updateProcurementStatus(user, id, dto.status, dto.reason);
  }

  @Post('orders/:id/approve')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.APPROVED, dto?.reason);
  }

  @Post('orders/:id/waiting-supplier')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  waitingSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.WAITING_SUPPLIER_CONFIRMATION, dto?.reason);
  }

  @Post('orders/:id/supplier-confirmed')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  supplierConfirmed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.SUPPLIER_CONFIRMED, dto?.reason);
  }

  @Post('orders/:id/factory-confirmed')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  factoryConfirmed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.FACTORY_CONFIRMED, dto?.reason);
  }

  @Post('orders/:id/mark-paid')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.PAID, dto?.reason);
  }

  @Post('orders/:id/mark-production')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_PRODUCTION, dto?.reason);
  }

  @Post('orders/:id/ready-for-shipment')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  readyForShipment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.READY_TO_SHIP, dto?.reason);
  }

  @Post('orders/:id/mark-shipped-to-yiwu')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.SHIPPED_TO_YIWU, dto?.reason);
  }

  @Post('orders/:id/in-china-warehouse')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  inChinaWarehouse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_CHINA_WAREHOUSE, dto?.reason);
  }

  @Post('orders/:id/mark-in-transit')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_TRANSIT, dto?.reason);
  }

  @Post('orders/:id/customs-clearance')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  customsClearance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.CUSTOMS_CLEARANCE, dto?.reason);
  }

  @Post('orders/:id/mark-arrived')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.ARRIVED_AT_HQ_WAREHOUSE, dto?.reason);
  }

  @Post('orders/:id/complete')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.COMPLETED, dto?.reason);
  }

  @Post('orders/:id/cancel')
  @Permissions('procurement.manage')
  @Roles(...STATUS_ROLES)
  cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) {
    return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.CANCELLED, dto?.reason);
  }

  @Post('purchase-orders')
  @Permissions('procurement.manage', 'crm.manage', 'sales.manage')
  createPo(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createPurchaseOrder(user, dto);
  }

  @Get('purchase-orders')
  @Permissions('procurement.manage', 'crm.manage', 'sales.manage')
  purchaseOrders(@CurrentUser() user: AuthUser) {
    return this.service.purchaseOrders(user);
  }

  @Get('purchase-orders/:id')
  @Permissions('procurement.manage', 'crm.manage', 'sales.manage')
  purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.purchaseOrder(user, id);
  }

  @Put('purchase-orders/:id/status')
  @Permissions('procurement.manage', 'crm.manage', 'sales.manage')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateStatus(user, id, dto);
  }

  @Post('shipments')
  @Permissions('procurement.manage')
  createShipment(@Body() dto: any) {
    return this.service.createShipment(dto);
  }

  @Get('shipments')
  @Permissions('procurement.manage', 'procurement.landed_cost.view')
  shipments() {
    return this.service.shipments();
  }
}
