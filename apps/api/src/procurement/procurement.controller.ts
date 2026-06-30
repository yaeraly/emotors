import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

const PROCUREMENT_VIEW_PERMISSIONS = ['procurement.manage', 'procurement.view'] as const;

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Post('suppliers')
  @RequirePermissions('procurement.manage')
  createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }

  @Get('suppliers')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  suppliers() { return this.service.suppliers(); }

  @Get('suppliers/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  supplier(@Param('id') id: string) { return this.service.supplier(id); }

  @Put('suppliers/:id')
  @RequirePermissions('procurement.manage')
  updateSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(user, id, dto); }

  @Delete('suppliers/:id')
  @RequirePermissions('procurement.manage')
  deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.deleteSupplier(user, id, dto?.reason); }

  @Post('suppliers/:id/contacts')
  @RequirePermissions('procurement.manage')
  createSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.createSupplierContact(id, dto); }

  @Get('suppliers/:id/contacts')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  supplierContacts(@Param('id') id: string) { return this.service.supplierContacts(id); }

  @Put('contacts/:id')
  @RequirePermissions('procurement.manage')
  updateSupplierContact(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplierContact(id, dto); }

  @Delete('contacts/:id')
  @RequirePermissions('procurement.manage')
  deleteSupplierContact(@Param('id') id: string) { return this.service.deleteSupplierContact(id); }

  @Post('factories')
  @RequirePermissions('procurement.manage')
  createFactory(@Body() dto: any) { return this.service.createFactory(dto); }

  @Get('factories')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  factories() { return this.service.factories(); }

  @Get('factories/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  factory(@Param('id') id: string) { return this.service.factory(id); }

  @Put('factories/:id')
  @RequirePermissions('procurement.manage')
  updateFactory(@Param('id') id: string, @Body() dto: any) { return this.service.updateFactory(id, dto); }

  @Delete('factories/:id')
  @RequirePermissions('procurement.manage')
  deleteFactory(@Param('id') id: string) { return this.service.deleteFactory(id); }

  @Post('orders')
  @RequirePermissions('procurement.manage')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }

  @Get('orders')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  procurementOrders() { return this.service.procurementOrders(); }

  @Get('orders/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }

  @Get('orders/:id/audit-logs')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  procurementOrderAuditLogs(@Param('id') id: string) { return this.service.procurementOrderAuditLogs(id); }

  @Put('orders/:id')
  @RequirePermissions('procurement.manage')
  updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(user, id, dto); }

  @Post('orders/:id/recalculate')
  @RequirePermissions('procurement.manage')
  recalculateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.recalculateProcurementOrder(user, id, dto?.reason); }

  @Post('orders/:id/approve')
  @RequirePermissions('procurement.manage')
  approveProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'APPROVED' as any); }

  @Post('orders/:id/mark-paid')
  @RequirePermissions('procurement.manage')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'PAID' as any); }

  @Post('orders/:id/mark-production')
  @RequirePermissions('procurement.manage')
  markProduction(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_PRODUCTION' as any); }

  @Post('orders/:id/mark-shipped-to-yiwu')
  @RequirePermissions('procurement.manage')
  markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'SHIPPED_TO_YIWU' as any); }

  @Post('orders/:id/mark-in-transit')
  @RequirePermissions('procurement.manage')
  markTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'IN_TRANSIT' as any); }

  @Post('orders/:id/mark-arrived')
  @RequirePermissions('procurement.manage')
  markArrived(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'ARRIVED' as any); }

  @Post('orders/:id/cancel')
  @RequirePermissions('procurement.manage')
  cancelProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementStatus(user, id, 'CANCELLED' as any, dto?.reason); }

  @Post('purchase-orders')
  @RequirePermissions('procurement.manage')
  createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }

  @Get('purchase-orders')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }

  @Get('purchase-orders/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }

  @Put('purchase-orders/:id/status')
  @RequirePermissions('procurement.manage')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }

  @Post('shipments')
  @RequirePermissions('procurement.manage')
  createShipment(@Body() dto: any) { return this.service.createShipment(dto); }

  @Get('shipments')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  shipments() { return this.service.shipments(); }
}
