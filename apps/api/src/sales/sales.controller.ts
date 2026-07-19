import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SaleCustomerSearchQueryDto, SaleProductSearchQueryDto } from './dto/sale-search-query.dto';
import { RejectSaleInstallmentDto } from './dto/reject-sale-installment.dto';
import { ReceiveInstallmentPaymentDto } from './dto/receive-installment-payment.dto';
import { SaleInstallmentApprovalService } from './sale-installment-approval.service';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.FRANCHISE_OWNER,
  Role.MANAGER,
  Role.CASHIER,
  Role.HQ_ACCOUNTANT,
  Role.FINANCE_MANAGER,
)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly saleInstallmentApprovalService: SaleInstallmentApprovalService,
  ) {}

  @Post()
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user, dto);
  }

  @Post('draft')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  createDraft(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.salesService.createDraft(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: SaleQueryDto) {
    return this.salesService.findAll(user, query);
  }

  @Get('installments')
  listInstallments(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'active' | 'closed',
  ) {
    return this.salesService.listInstallments(user, scope);
  }

  @Get('installments/:installmentId')
  findInstallment(
    @CurrentUser() user: AuthUser,
    @Param('installmentId') installmentId: string,
  ) {
    return this.saleInstallmentApprovalService.findInstallment(user, installmentId);
  }

  @Post('installments/:installmentId/payments')
  @Roles(Role.FRANCHISE_OWNER, Role.MANAGER)
  receiveInstallmentPayment(
    @CurrentUser() user: AuthUser,
    @Param('installmentId') installmentId: string,
    @Body() dto: ReceiveInstallmentPaymentDto,
  ) {
    return this.saleInstallmentApprovalService.receiveInstallmentPayment(user, installmentId, dto);
  }

  @Get('installment-requests')
  @Roles(Role.FRANCHISE_OWNER)
  listInstallmentRequests(@CurrentUser() user: AuthUser) {
    return this.saleInstallmentApprovalService.listInstallmentRequests(user);
  }

  @Post(':id/installment-request/submit')
  @Roles(Role.MANAGER)
  submitInstallmentRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.saleInstallmentApprovalService.submitInstallmentRequest(user, id);
  }

  @Post(':id/installment-request/approve')
  @Roles(Role.FRANCHISE_OWNER)
  approveInstallmentRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.saleInstallmentApprovalService.approveInstallmentRequest(user, id);
  }

  @Post(':id/installment-request/reject')
  @Roles(Role.FRANCHISE_OWNER)
  rejectInstallmentRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectSaleInstallmentDto,
  ) {
    return this.saleInstallmentApprovalService.rejectInstallmentRequest(user, id, dto);
  }

  @Get('customer-options')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  searchCustomers(
    @CurrentUser() user: AuthUser,
    @Query() query: SaleCustomerSearchQueryDto,
  ) {
    return this.salesService.searchCustomerOptions(user, query);
  }

  @Get('product-options')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  searchProducts(
    @CurrentUser() user: AuthUser,
    @Query() query: SaleProductSearchQueryDto,
  ) {
    return this.salesService.searchProductOptions(user, query);
  }

  @Get('reports/daily')
  dailyReport(@CurrentUser() user: AuthUser, @Query() query: SaleQueryDto) {
    return this.salesService.dailyReport(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findOne(user, id);
  }

  @Put(':id')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.updateDraft(user, id, dto);
  }

  @Post(':id/send-whatsapp')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  sendWhatsApp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.sendWhatsApp(user, id);
  }

  @Post(':id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.approve(user, id);
  }

  @Post(':id/payments')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.CASHIER)
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.salesService.addPayment(user, id, dto);
  }

  @Post(':id/payments/:paymentId/void')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.CASHIER)
  voidPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.salesService.voidPayment(user, id, paymentId);
  }

  @Post(':id/finalize')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  finalize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.finalize(user, id);
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR, Role.FRANCHISE_OWNER, Role.MANAGER)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.cancel(user, id);
  }

  @Get(':id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.receipt(user, id);
  }
}
