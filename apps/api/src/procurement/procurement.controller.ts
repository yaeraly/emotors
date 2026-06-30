import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('procurement.manage')
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Post('suppliers') createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }
  @Get('suppliers') suppliers() { return this.service.suppliers(); }
  @Get('suppliers/:id') supplier(@Param('id') id: string) { return this.service.supplier(id); }
  @Put('suppliers/:id') updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(user, id, dto); }
  @Delete('suppliers/:id') deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.deleteSupplier(user, id, dto?.reason); }
  @Post('suppliers/:id/contacts') createSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.createSupplierContact(id, dto); }
  @Get('suppliers/:id/contacts') supplierContacts(@Param('id') id: string) { return this.service.supplierContacts(id); }
  @Put('contacts/:id') updateSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplierContact(id, dto); }
  @Delete('contacts/:id') deleteSupplierContact(@Param('id') id: string) { return this.service.deleteSupplierContact(id); }
  @Post('factories') createFactory(@Body() dto: any) { return this.service.createFactory(dto); }
  @Get('factories') factories() { return this.service.factories(); }
  @Get('factories/:id') factory(@Param('id') id: string) { return this.service.factory(id); }
  @Put('factories/:id') updateFactory(@Param('id') id: string, @Body() dto: any) { return this.service.updateFactory(id, dto); }
  @Delete('factories/:id') deleteFactory(@Param('id') id: string) { return this.service.deleteFactory(id); }
  @Post('orders') createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }
  @Get('orders') procurementOrders() { return this.service.procurementOrders(); }
  @Get('orders/:id') procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }
  @Get('orders/:id/audit-logs') procurementOrderAuditLogs(@Param('id') id: string) { return this.service.procurementOrderAuditLogs(id); }
  @Put('orders/:id') updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(user, id, dto); }
  @Post('orders/:id/recalculate') recalculateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.recalculateProcurementOrder(user, id, dto?.reason); }
  @Post('orders/:id/approve') approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'APPROVED' as any); }
  @Post('orders/:id/mark-paid') markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'PAID' as any); }
  @Post('orders/:id/mark-production') markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_PRODUCTION' as any); }
  @Post('orders/:id/mark-shipped-to-yiwu') markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'SHIPPED_TO_YIWU' as any); }
  @Post('orders/:id/mark-in-transit') markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_TRANSIT' as any); }
  @Post('orders/:id/mark-arrived') markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'ARRIVED' as any); }
  @Post('orders/:id/cancel') cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementStatus(user, id, 'CANCELLED' as any, dto?.reason); }
  @Post('purchase-orders') createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }
  @Get('purchase-orders') purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }
  @Get('purchase-orders/:id') purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }
  @Put('purchase-orders/:id/status') status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }
  @Post('shipments') createShipment(@Body() dto: any) { return this.service.createShipment(dto); }
  @Get('shipments') shipments() { return this.service.shipments(); }
}
