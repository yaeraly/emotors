import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { LandedCostAllocationMethod, ProcurementOrderStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

const PROCUREMENT_ROLES = [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER] as const;
const STATUS_ROLES = [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER] as const;
const LANDED_COST_VIEW_ROLES = [...PROCUREMENT_ROLES, Role.FINANCE_MANAGER] as const;

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PROCUREMENT_ROLES)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Post('suppliers') @Roles(...PROCUREMENT_ROLES) createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }
  @Get('suppliers') suppliers() { return this.service.suppliers(); }
  @Get('suppliers/:id') supplier(@Param('id') id: string) { return this.service.supplier(id); }
  @Put('suppliers/:id') @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER) updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(user, id, dto); }
  @Delete('suppliers/:id') @Roles(Role.CEO) deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.deleteSupplier(user, id, dto?.reason); }
  @Post('suppliers/:id/contacts') @Roles(...PROCUREMENT_ROLES) createSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.createSupplierContact(id, dto); }
  @Get('suppliers/:id/contacts') supplierContacts(@Param('id') id: string) { return this.service.supplierContacts(id); }
  @Put('contacts/:id') @Roles(...PROCUREMENT_ROLES) updateSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplierContact(id, dto); }
  @Delete('contacts/:id') @Roles(...PROCUREMENT_ROLES) deleteSupplierContact(@Param('id') id: string) { return this.service.deleteSupplierContact(id); }
  @Post('factories') @Roles(...PROCUREMENT_ROLES) createFactory(@Body() dto: any) { return this.service.createFactory(dto); }
  @Get('factories') factories() { return this.service.factories(); }
  @Get('factories/:id') factory(@Param('id') id: string) { return this.service.factory(id); }
  @Put('factories/:id') @Roles(...PROCUREMENT_ROLES) updateFactory(@Param('id') id: string, @Body() dto: any) { return this.service.updateFactory(id, dto); }
  @Delete('factories/:id') @Roles(...PROCUREMENT_ROLES) deleteFactory(@Param('id') id: string) { return this.service.deleteFactory(id); }

  @Post('orders') @Roles(...PROCUREMENT_ROLES) createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }
  @Get('orders') @Roles(...LANDED_COST_VIEW_ROLES) procurementOrders() { return this.service.procurementOrders(); }
  @Get('orders/:id') @Roles(...LANDED_COST_VIEW_ROLES) procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }
  @Get('orders/:id/history') @Roles(...LANDED_COST_VIEW_ROLES) procurementOrderHistory(@Param('id') id: string) { return this.service.procurementOrderHistory(id); }
  @Put('orders/:id') @Roles(...PROCUREMENT_ROLES) updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(user, id, dto); }
  @Put('orders/:id/transport-costs') @Roles(...PROCUREMENT_ROLES) updateTransportCosts(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementTransportCosts(user, id, dto); }
  @Put('orders/:id/allocation-method') @Roles(...PROCUREMENT_ROLES) updateAllocationMethod(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: { allocationMethod: LandedCostAllocationMethod; reason?: string }) { return this.service.updateAllocationMethod(user, id, dto.allocationMethod, dto.reason); }
  @Post('orders/:id/recalculate-landed-cost') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.SUPPLY_CHAIN_MANAGER) recalculate(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.recalculateLandedCost(user, id); }
  @Put('orders/:id/items/:itemId') @Roles(...PROCUREMENT_ROLES) updateItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: any) { return this.service.updateProcurementItem(user, id, itemId, dto); }

  @Post('orders/:id/status') @Roles(...STATUS_ROLES) setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: { status: ProcurementOrderStatus; reason?: string }) { return this.service.updateProcurementStatus(user, id, dto.status, dto.reason); }
  @Post('orders/:id/approve') @Roles(...STATUS_ROLES) approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.APPROVED, dto?.reason); }
  @Post('orders/:id/waiting-supplier') @Roles(...STATUS_ROLES) waitingSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.WAITING_SUPPLIER_CONFIRMATION, dto?.reason); }
  @Post('orders/:id/supplier-confirmed') @Roles(...STATUS_ROLES) supplierConfirmed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.SUPPLIER_CONFIRMED, dto?.reason); }
  @Post('orders/:id/factory-confirmed') @Roles(...STATUS_ROLES) factoryConfirmed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.FACTORY_CONFIRMED, dto?.reason); }
  @Post('orders/:id/mark-paid') @Roles(...STATUS_ROLES) markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.PAID, dto?.reason); }
  @Post('orders/:id/mark-production') @Roles(...STATUS_ROLES) markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_PRODUCTION, dto?.reason); }
  @Post('orders/:id/ready-for-shipment') @Roles(...STATUS_ROLES) readyForShipment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.READY_TO_SHIP, dto?.reason); }
  @Post('orders/:id/mark-shipped-to-yiwu') @Roles(...STATUS_ROLES) markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.SHIPPED_TO_YIWU, dto?.reason); }
  @Post('orders/:id/in-china-warehouse') @Roles(...STATUS_ROLES) inChinaWarehouse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_CHINA_WAREHOUSE, dto?.reason); }
  @Post('orders/:id/mark-in-transit') @Roles(...STATUS_ROLES) markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.IN_TRANSIT, dto?.reason); }
  @Post('orders/:id/customs-clearance') @Roles(...STATUS_ROLES) customsClearance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.CUSTOMS_CLEARANCE, dto?.reason); }
  @Post('orders/:id/mark-arrived') @Roles(...STATUS_ROLES) markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.ARRIVED_AT_HQ_WAREHOUSE, dto?.reason); }
  @Post('orders/:id/complete') @Roles(...STATUS_ROLES) complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.COMPLETED, dto?.reason); }
  @Post('orders/:id/cancel') @Roles(...STATUS_ROLES) cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto?: { reason?: string }) { return this.service.updateProcurementStatus(user, id, ProcurementOrderStatus.CANCELLED, dto?.reason); }

  @Post('purchase-orders') createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }
  @Get('purchase-orders') purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }
  @Get('purchase-orders/:id') purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }
  @Put('purchase-orders/:id/status') status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }
  @Post('shipments') createShipment(@Body() dto: any) { return this.service.createShipment(dto); }
  @Get('shipments') shipments() { return this.service.shipments(); }
}
