import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { FileAttachmentEntityType } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../roles/permissions.decorator';
import { PermissionsGuard } from '../roles/permissions.guard';
import { RolesGuard } from '../roles/roles.guard';
import { ConfirmSupplierPaymentDto } from './dto/confirm-supplier-payment.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { UpsertPaymentInfoDto } from './dto/payment-info.dto';
import { ReturnSupplierPaymentDto } from './dto/return-supplier-payment.dto';
import { ReverseSupplierPaymentDto } from './dto/reverse-supplier-payment.dto';
import { SendInvoiceToAccountantDto } from './dto/send-invoice-to-accountant.dto';
import {
  ApproveTransportExpenseDto,
  ConfirmTransportExpenseDto,
  CreateTransportExpenseDto,
  ReturnTransportExpenseDto,
  UpdateTransportExpenseDto,
} from './dto/transport-expense.dto';
import { UpdateSupplierPaymentDto } from './dto/update-supplier-payment.dto';
import { UpdateCargoReceiptDto } from './dto/update-cargo-receipt.dto';
import { UpdateChinaDomesticTransportDto } from './dto/update-china-domestic-transport.dto';
import { UpdateImportCostsDto } from './dto/update-import-costs.dto';
import { UpdateLocalTransportDto } from './dto/update-local-transport.dto';
import { UpdateSvhToHqTransportDto } from './dto/update-svh-to-hq-transport.dto';
import { VoidSupplierPaymentDto } from './dto/void-supplier-payment.dto';
import { UnlockProcurementOrderDto } from './dto/unlock-procurement-order.dto';
import { DeleteArchiveDto } from '../common/dto/delete-archive.dto';
import { PaymentInfoService } from './payment-info.service';
import { ProcurementService } from './procurement.service';
import { TransportExpenseService } from './transport-expense.service';

const PROCUREMENT_VIEW_PERMISSIONS = ['procurement.manage', 'procurement.view'] as const;

@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProcurementController {
  constructor(
    private readonly service: ProcurementService,
    private readonly paymentInfoService: PaymentInfoService,
    private readonly transportExpenseService: TransportExpenseService,
  ) {}

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
  transportCompanies(
    @CurrentUser() user: AuthUser,
    @Query('selectable') selectable?: string,
    @Query('q') q?: string,
  ) {
    return this.service.transportCompanies(user, selectable === 'true', q);
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

  @Post('transport-companies/:id/attachments/qr')
  @RequirePermissions('procurement.manage')
  uploadTransportCompanyQr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadTransportCompanyQr(user, id, request);
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

  @Get('supplier-payment-accounts')
  @RequirePermissions('finance.view', 'payments.manage', 'procurement.manage')
  supplierPaymentAccounts(@CurrentUser() user: AuthUser) {
    return this.service.listHqFinanceAccountsForPayments(user);
  }

  @Get('accountant-payment-queue')
  @RequirePermissions('finance.view', 'payments.manage')
  accountantPaymentQueue(@CurrentUser() user: AuthUser) {
    return this.service.listAccountantPaymentQueue(user);
  }

  @Get('cashier-payment-queue')
  @RequirePermissions('payments.manage', 'finance.view')
  cashierPaymentQueue(@CurrentUser() user: AuthUser) {
    return this.service.listCashierPaymentQueue(user);
  }

  @Get('orders/:id/supplier-payments')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'payments.manage')
  supplierPayments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.supplierPayments(user, id);
  }

  @Get('orders/:id/payment-info')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'payments.manage')
  paymentInfoVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentInfoService.listVersions(user, id);
  }

  @Get('orders/:id/payment-info/active')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'payments.manage')
  activePaymentInfo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentInfoService.getActiveVersion(user, id);
  }

  @Put('orders/:id/payment-info')
  @RequirePermissions('procurement.manage')
  upsertPaymentInfo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertPaymentInfoDto,
  ) {
    return this.paymentInfoService.upsertPaymentInfo(user, id, dto);
  }

  @Post('orders/:id/payment-info/qr')
  @RequirePermissions('procurement.manage')
  uploadPaymentQr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.paymentInfoService.uploadQr(user, id, request);
  }

  @Delete('orders/:id/payment-info/qr/:attachmentId')
  @RequirePermissions('procurement.manage')
  removePaymentQr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.paymentInfoService.removeQr(user, id, attachmentId);
  }

  @Get('transport-expenses')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'payments.manage')
  transportExpenses(@CurrentUser() user: AuthUser, @Query('orderId') orderId?: string) {
    return this.transportExpenseService.list(user, orderId);
  }

  @Get('transport-expenses/accountant-queue')
  @RequirePermissions('finance.view', 'payments.manage')
  transportExpenseAccountantQueue(@CurrentUser() user: AuthUser) {
    return this.transportExpenseService.listAccountantQueue(user);
  }

  @Get('transport-expenses/cashier-queue')
  @RequirePermissions('payments.manage', 'finance.view')
  transportExpenseCashierQueue(@CurrentUser() user: AuthUser) {
    return this.transportExpenseService.listCashierQueue(user);
  }

  @Get('transport-expenses/:id')
  @RequirePermissions(...PROCUREMENT_VIEW_PERMISSIONS, 'finance.view', 'payments.manage')
  transportExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportExpenseService.getOne(user, id);
  }

  @Post('transport-expenses')
  @RequirePermissions('procurement.manage')
  createTransportExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateTransportExpenseDto) {
    return this.transportExpenseService.create(user, dto);
  }

  @Put('transport-expenses/:id')
  @RequirePermissions('procurement.manage')
  updateTransportExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTransportExpenseDto,
  ) {
    return this.transportExpenseService.update(user, id, dto);
  }

  @Post('transport-expenses/:id/submit')
  @RequirePermissions('procurement.manage')
  submitTransportExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportExpenseService.submitToAccountant(user, id);
  }

  @Post('transport-expenses/:id/approve')
  @RequirePermissions('finance.view', 'payments.manage')
  approveTransportExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveTransportExpenseDto,
  ) {
    return this.transportExpenseService.approveAndSendToCashier(user, id, dto);
  }

  @Post('transport-expenses/:id/return')
  @RequirePermissions('finance.view', 'payments.manage')
  returnTransportExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReturnTransportExpenseDto,
  ) {
    return this.transportExpenseService.returnToCreator(user, id, dto);
  }

  @Post('transport-expenses/:id/confirm')
  @RequirePermissions('payments.manage', 'finance.view')
  confirmTransportExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmTransportExpenseDto,
  ) {
    return this.transportExpenseService.confirmPayment(user, id, dto);
  }

  @Post('transport-expenses/:id/attachments/invoice')
  @RequirePermissions('procurement.manage')
  uploadTransportExpenseInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transportExpenseService.uploadAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.TRANSPORT_EXPENSE_INVOICE,
    );
  }

  @Post('transport-expenses/:id/attachments/qr')
  @RequirePermissions('procurement.manage')
  uploadTransportExpenseQr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transportExpenseService.uploadQr(user, id, request);
  }

  @Delete('transport-expenses/:id/attachments/qr/:attachmentId')
  @RequirePermissions('procurement.manage')
  removeTransportExpenseQr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.transportExpenseService.removeQr(user, id, attachmentId);
  }

  @Post('transport-expenses/:id/attachments/qr-from-company')
  @RequirePermissions('procurement.manage')
  attachTransportExpenseQrFromCompany(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { transportCompanyId?: string },
  ) {
    return this.transportExpenseService.attachCompanyQr(user, id, dto?.transportCompanyId || '');
  }

  @Post('transport-expenses/:id/attachments/receipt')
  @RequirePermissions('payments.manage', 'finance.view')
  uploadTransportExpenseReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transportExpenseService.uploadAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.TRANSPORT_EXPENSE_RECEIPT,
    );
  }

  @Post('transport-expenses/:id/attachments/cargo-receipt')
  @RequirePermissions('procurement.manage')
  uploadTransportExpenseCargoReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transportExpenseService.uploadAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.CARGO_RECEIPT,
    );
  }

  @Post('orders/:id/send-invoice-to-accountant')
  @RequirePermissions('procurement.manage')
  sendInvoiceToAccountant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendInvoiceToAccountantDto,
  ) {
    return this.service.sendInvoiceToAccountant(user, id, dto);
  }

  @Post('orders/:id/attachments/supplier-invoice')
  @RequirePermissions('procurement.manage')
  uploadSupplierInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.uploadProcurementAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.SUPPLIER_INVOICE,
    );
  }

  @Post('orders/:id/supplier-payments')
  @RequirePermissions('finance.view', 'payments.manage')
  createSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupplierPaymentDto,
  ) {
    return this.service.createSupplierPayment(user, id, dto);
  }

  @Put('orders/:id/supplier-payments/:paymentId')
  @RequirePermissions('finance.view', 'payments.manage')
  updateSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateSupplierPaymentDto,
  ) {
    return this.service.updateSupplierPayment(user, id, paymentId, dto);
  }

  @Post('orders/:id/supplier-payments/:paymentId/send-to-cashier')
  @RequirePermissions('finance.view', 'payments.manage')
  sendSupplierPaymentToCashier(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.service.sendSupplierPaymentToCashier(user, id, paymentId);
  }

  @Post('orders/:id/supplier-payments/:paymentId/return-to-accountant')
  @RequirePermissions('payments.manage', 'finance.view')
  returnSupplierPaymentToAccountant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReturnSupplierPaymentDto,
  ) {
    return this.service.returnSupplierPaymentToAccountant(user, id, paymentId, dto);
  }

  @Post('orders/:id/supplier-payments/:paymentId/confirm')
  @RequirePermissions('payments.manage', 'finance.view')
  confirmSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmSupplierPaymentDto,
  ) {
    return this.service.confirmSupplierPayment(user, id, paymentId, dto);
  }

  @Post('orders/:id/supplier-payments/:paymentId/void')
  @RequirePermissions('finance.manage', 'finance.view')
  voidSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidSupplierPaymentDto,
  ) {
    return this.service.voidSupplierPayment(user, id, paymentId, dto);
  }

  @Post('orders/:id/supplier-payments/:paymentId/reverse')
  @RequirePermissions('finance.manage')
  reverseSupplierPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReverseSupplierPaymentDto,
  ) {
    return this.service.reverseSupplierPayment(user, id, paymentId, dto);
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
