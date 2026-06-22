import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ProcurementService } from './procurement.service';

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.PROCUREMENT_MANAGER)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}
  @Post('suppliers') createSupplier(@Body() dto: any) { return this.service.createSupplier(dto); }
  @Get('suppliers') suppliers() { return this.service.suppliers(); }
  @Get('suppliers/:id') supplier(@Param('id') id: string) { return this.service.supplier(id); }
  @Put('suppliers/:id') updateSupplier(@Param('id') id: string, @Body() dto: any) { return this.service.updateSupplier(id, dto); }
  @Post('purchase-orders') createPo(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createPurchaseOrder(user, dto); }
  @Get('purchase-orders') purchaseOrders(@CurrentUser() user: AuthUser) { return this.service.purchaseOrders(user); }
  @Get('purchase-orders/:id') purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.purchaseOrder(user, id); }
  @Put('purchase-orders/:id/status') status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateStatus(user, id, dto); }
  @Post('shipments') createShipment(@Body() dto: any) { return this.service.createShipment(dto); }
  @Get('shipments') shipments() { return this.service.shipments(); }
}
