import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

const PROCUREMENT_READ_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.PROCUREMENT_MANAGER,
  Role.SUPPLY_CHAIN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.ACCOUNTANT,
  Role.WAREHOUSE_MANAGER,
] as const;

const PROCUREMENT_WRITE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.PROCUREMENT_MANAGER,
  Role.SUPPLY_CHAIN_MANAGER,
] as const;

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Post('suppliers') @Roles(...PROCUREMENT_WRITE_ROLES) createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }
  @Get('suppliers') @Roles(...PROCUREMENT_READ_ROLES) suppliers() { return this.service.suppliers(); }
  @Get('suppliers/:id') @Roles(...PROCUREMENT_READ_ROLES) supplier(@Param('id') id: string) { return this.service.supplier(id); }
  @Put('suppliers/:id') @Roles(Role.CEO, Role.SUPPLY_CHAIN_MANAGER) updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(user, id, dto); }
  @Delete('suppliers/:id') @Roles(Role.CEO) deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.deleteSupplier(user, id, dto?.reason); }
  @Post('suppliers/:id/contacts') @Roles(...PROCUREMENT_WRITE_ROLES) createSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.createSupplierContact(id, dto); }
  @Get('suppliers/:id/contacts') @Roles(...PROCUREMENT_READ_ROLES) supplierContacts(@Param('id') id: string) { return this.service.supplierContacts(id); }
  @Put('contacts/:id') @Roles(...PROCUREMENT_WRITE_ROLES) updateSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplierContact(id, dto); }
  @Delete('contacts/:id') @Roles(...PROCUREMENT_WRITE_ROLES) deleteSupplierContact(@Param('id') id: string) { return this.service.deleteSupplierContact(id); }
  @Post('factories') @Roles(...PROCUREMENT_WRITE_ROLES) createFactory(@Body() dto: any) { return this.service.createFactory(dto); }
  @Get('factories') @Roles(...PROCUREMENT_READ_ROLES) factories() { return this.service.factories(); }
  @Get('factories/:id') @Roles(...PROCUREMENT_READ_ROLES) factory(@Param('id') id: string) { return this.service.factory(id); }
  @Put('factories/:id') @Roles(...PROCUREMENT_WRITE_ROLES) updateFactory(@Param('id') id: string, @Body() dto: any) { return this.service.updateFactory(id, dto); }
  @Delete('factories/:id') @Roles(...PROCUREMENT_WRITE_ROLES) deleteFactory(@Param('id') id: string) { return this.service.deleteFactory(id); }
  @Post('orders') @Roles(...PROCUREMENT_WRITE_ROLES) createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }
  @Get('orders') @Roles(...PROCUREMENT_READ_ROLES) procurementOrders() { return this.service.procurementOrders(); }
  @Get('orders/:id') @Roles(...PROCUREMENT_READ_ROLES) procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }
  @Get('orders/:id/audit-logs') @Roles(...PROCUREMENT_READ_ROLES) procurementOrderAuditLogs(@Param('id') id: string) { return this.service.procurementOrderAuditLogs(id); }
  @Put('orders/:id') @Roles(...PROCUREMENT_WRITE_ROLES) updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(user, id, dto); }
  @Post('orders/:id/recalculate') @Roles(...PROCUREMENT_WRITE_ROLES) recalculateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.recalculateProcurementOrder(user, id, dto?.reason); }
  @Post('orders/:id/approve') @Roles(...PROCUREMENT_WRITE_ROLES) approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'APPROVED' as any); }
  @Post('orders/:id/mark-paid') @Roles(...PROCUREMENT_WRITE_ROLES) markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'PAID' as any); }
  @Post('orders/:id/mark-production') @Roles(...PROCUREMENT_WRITE_ROLES) markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_PRODUCTION' as any); }
  @Post('orders/:id/mark-shipped-to-yiwu') @Roles(...PROCUREMENT_WRITE_ROLES) markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'SHIPPED_TO_YIWU' as any); }
  @Post('orders/:id/mark-in-transit') @Roles(...PROCUREMENT_WRITE_ROLES) markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_TRANSIT' as any); }
  @Post('orders/:id/mark-arrived') @Roles(...PROCUREMENT_WRITE_ROLES) markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'ARRIVED' as any); }
  @Post('orders/:id/cancel') @Roles(...PROCUREMENT_WRITE_ROLES) cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementStatus(user, id, 'CANCELLED' as any, dto?.reason); }
  @Post('purchase-orders') @Roles(...PROCUREMENT_WRITE_ROLES) createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }
  @Get('purchase-orders') @Roles(...PROCUREMENT_READ_ROLES) purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }
  @Get('purchase-orders/:id') @Roles(...PROCUREMENT_READ_ROLES) purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }
  @Put('purchase-orders/:id/status') @Roles(...PROCUREMENT_WRITE_ROLES) status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }
  @Post('shipments') @Roles(...PROCUREMENT_WRITE_ROLES) createShipment(@Body() dto: any) { return this.service.createShipment(dto); }
  @Get('shipments') @Roles(...PROCUREMENT_READ_ROLES) shipments() { return this.service.shipments(); }
}
