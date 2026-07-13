import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { FileAttachmentEntityType } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { UpdateSupplierPaymentDto } from './dto/update-supplier-payment.dto';
import { UpdateCargoReceiptDto } from './dto/update-cargo-receipt.dto';
import { UpdateChinaDomesticTransportDto } from './dto/update-china-domestic-transport.dto';
import { UpdateImportCostsDto } from './dto/update-import-costs.dto';
import { UpdateLocalTransportDto } from './dto/update-local-transport.dto';
import { UpdateSvhToHqTransportDto } from './dto/update-svh-to-hq-transport.dto';
import { VoidSupplierPaymentDto } from './dto/void-supplier-payment.dto';
import { UnlockProcurementOrderDto } from './dto/unlock-procurement-order.dto';
import { DeleteArchiveDto } from '../common/dto/delete-archive.dto';
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

  @Post('transport-companies')
  @RequirePermissions('procurement.manage')
  createTransportCompany(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createTransportCompany(user, dto);
  }

  @Get('transport-companies')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  transportCompanies(@CurrentUser() user: AuthUser, @Query('selectable') selectable?: string) {
    return this.service.transportCompanies(user, selectable === 'true');
  }

  @Get('transport-companies/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  transportCompany(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.transportCompany(user, id);
  }

  @Put('transport-companies/:id')
  @RequirePermissions('procurement.manage')
  updateTransportCompany(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateTransportCompany(user, id, dto);
  }

  @Post('transport-companies/:id/archive')
  @RequirePermissions('procurement.manage')
  archiveTransportCompany(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.archiveTransportCompany(user, id, dto?.reason);
  }

  @Post('orders')
  @RequirePermissions('procurement.manage')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: any) { return this.service.createProcurementOrder(user, dto); }

  @Get('orders')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS)
  procurementOrders() { return this.service.procurementOrders(); }

  @Get('orders/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  procurementOrder(@Param('id') id: string) { return this.service.procurementOrder(id); }

  @Get('orders/:id/landed-cost')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  procurementLandedCostDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getProcurementLandedCostDetail(user, id);
  }

  @Get('orders/:id/svh-to-hq-transport')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'procurement.receive')
  svhToHqTransport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.svhToHqTransport(user, id);
  }

  @Put('orders/:id/svh-to-hq-transport')
  @RequirePermissions('procurement.manage', 'procurement.receive')
  upsertSvhToHqTransport(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSvhToHqTransportDto) {
    return this.service.upsertSvhToHqTransport(user, id, dto);
  }

  @Put('orders/:id/china-domestic-transport')
  @RequirePermissions('procurement.manage')
  updateChinaDomesticTransport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChinaDomesticTransportDto,
  ) {
    return this.service.updateChinaDomesticTransport(user, id, dto);
  }

  @Put('orders/:id/local-transport')
  @RequirePermissions('procurement.manage')
  updateLocalTransport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLocalTransportDto,
  ) {
    return this.service.updateLocalTransport(user, id, dto);
  }

  @Put('orders/:id/cargo-receipt')
  @RequirePermissions('procurement.manage')
  updateCargoReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCargoReceiptDto,
  ) {
    return this.service.updateCargoReceipt(user, id, dto);
  }

  @Put('orders/:id/import-costs')
  @RequirePermissions('procurement.manage')
  updateImportCosts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateImportCostsDto,
  ) {
    return this.service.updateImportCosts(user, id, dto);
  }

  @Get('orders/:id/audit-logs')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  procurementOrderAuditLogs(@Param('id') id: string) { return this.service.procurementOrderAuditLogs(id); }

  @Get('orders/:id/supplier-payments')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  supplierPayments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.supplierPayments(user, id);
  }

  @Post('orders/:id/supplier-payments')
  @RequirePermissions('procurement.manage', 'finance.view')
  createSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupplierPaymentDto,
  ) {
    return this.service.createSupplierPayment(user, id, dto);
  }

  @Put('orders/:id/supplier-payments/:paymentId')
  @RequirePermissions('procurement.manage', 'finance.view')
  updateSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateSupplierPaymentDto,
  ) {
    return this.service.updateSupplierPayment(user, id, paymentId, dto);
  }

  @Post('orders/:id/supplier-payments/:paymentId/void')
  @RequirePermissions('procurement.manage', 'finance.view')
  voidSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidSupplierPaymentDto,
  ) {
    return this.service.voidSupplierPayment(user, id, paymentId, dto);
  }

  @Get('orders/:id/attachments')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view')
  procurementAttachments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('entityType') entityType?: FileAttachmentEntityType,
  ) {
    return this.service.procurementAttachments(user, id, entityType);
  }

  @Post('orders/:id/attachments/cargo-receipt')
  @RequirePermissions('procurement.manage', 'finance.view', 'procurement.receive')
  uploadCargoReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadProcurementAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.CARGO_RECEIPT,
    );
  }

  @Post('orders/:id/attachments/svh-to-hq-receipt')
  @RequirePermissions('procurement.manage', 'finance.view')
  uploadSvhToHqReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadSvhToHqReceipt(user, id, request);
  }

  @Post('orders/:id/domestic-transport/attachments')
  @RequirePermissions('procurement.manage', 'finance.view')
  uploadDomesticTransportAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadDomesticTransportAttachment(user, id, request);
  }

  @Post('orders/:id/supplier-payments/:paymentId/attachments')
  @RequirePermissions('procurement.manage', 'finance.view')
  uploadSupplierPaymentReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadProcurementAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.SUPPLIER_PAYMENT,
      paymentId,
    );
  }

  @Delete('orders/:id/attachments/:attachmentId')
  @RequirePermissions('procurement.manage', 'finance.view')
  deleteProcurementAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.service.deleteProcurementAttachment(user, id, attachmentId);
  }

  @Put('orders/:id')
  @RequirePermissions('procurement.manage')
  updateProcurementOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) { return this.service.updateProcurementOrder(user, id, dto); }

  @Delete('orders/:id')
  deleteProcurementOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeleteArchiveDto,
  ) {
    return this.service.deleteProcurementOrder(user, id, dto?.reason);
  }

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

  @Post('orders/:id/mark-ordered')
  @RequirePermissions('procurement.manage')
  markOrdered(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.updateProcurementStatus(user, id, 'ORDERED' as any); }

  @Post('orders/:id/mark-sent-to-supplier')
  @RequirePermissions('procurement.manage')
  markSentToSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.markSentToSupplier(user, id, dto?.reason);
  }

  @Post('orders/:id/unlock')
  @RequirePermissions('procurement.manage')
  unlockProcurementOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UnlockProcurementOrderDto,
  ) {
    return this.service.unlockProcurementOrder(user, id, dto);
  }

  @Post('orders/:id/unlock-china-domestic-transport')
  @RequirePermissions('procurement.manage')
  unlockChinaDomesticTransport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UnlockProcurementOrderDto,
  ) {
    return this.service.unlockChinaDomesticTransport(user, id, dto);
  }

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
