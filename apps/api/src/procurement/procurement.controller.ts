import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}
  @Post('suppliers') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }
  @Get('suppliers') suppliers() { return this.service.suppliers(); }
  @Get('suppliers/:id') supplier(@Param('id') id: string) { return this.service.supplier(id); }
  @Put('suppliers/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) updateSupplier(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(id, dto); }
  @Delete('suppliers/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) deleteSupplier(@Param('id') id: string) { return this.service.deleteSupplier(id); }
  @Post('suppliers/:id/contacts') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) createSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.createSupplierContact(id, dto); }
  @Get('suppliers/:id/contacts') supplierContacts(@Param('id') id: string) { return this.service.supplierContacts(id); }
  @Put('contacts/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) updateSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplierContact(id, dto); }
  @Delete('contacts/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) deleteSupplierContact(@Param('id') id: string) { return this.service.deleteSupplierContact(id); }
  @Post('factories') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) createFactory(@Body() dto: any) { return this.service.createFactory(dto); }
  @Get('factories') factories() { return this.service.factories(); }
  @Get('factories/:id') factory(@Param('id') id: string) { return this.service.factory(id); }
  @Put('factories/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) updateFactory(@Param('id') id: string, @Body() dto: any) { return this.service.updateFactory(id, dto); }
  @Delete('factories/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) deleteFactory(@Param('id') id: string) { return this.service.deleteFactory(id); }
  @Post('orders') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }
  @Get('orders') procurementOrders() { return this.service.procurementOrders(); }
  @Get('orders/:id') procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }
  @Put('orders/:id') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) updateProcurementOrder(@Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(id, dto); }
  @Post('orders/:id/approve') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'APPROVED' as any); }
  @Post('orders/:id/mark-paid') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'PAID' as any); }
  @Post('orders/:id/mark-production') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_PRODUCTION' as any); }
  @Post('orders/:id/mark-shipped-to-yiwu') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'SHIPPED_TO_YIWU' as any); }
  @Post('orders/:id/mark-in-transit') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_TRANSIT' as any); }
  @Post('orders/:id/mark-arrived') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'ARRIVED' as any); }
  @Post('orders/:id/cancel') @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.PROCUREMENT_MANAGER, Role.SUPPLY_CHAIN_MANAGER) cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'CANCELLED' as any); }
  @Post('purchase-orders') createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }
  @Get('purchase-orders') purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }
  @Get('purchase-orders/:id') purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }
  @Put('purchase-orders/:id/status') status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }
  @Post('shipments') createShipment(@Body() dto: any) { return this.service.createShipment(dto); }
  @Get('shipments') shipments() { return this.service.shipments(); }
}
