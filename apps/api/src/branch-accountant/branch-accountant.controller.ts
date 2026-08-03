import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddBranchPaymentDto } from '../distribution/dto/add-branch-payment.dto';
import { CreateInstallmentEarlyPaymentDto } from '../distribution/dto/create-installment-early-payment.dto';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { BranchAccountantService } from './branch-accountant.service';
import { BranchAccountantInvoiceQueryDto } from './dto/branch-accountant-invoice-query.dto';
import { BranchAccountantInstallmentRequestDto } from './dto/installment-request.dto';
import { SelectPaymentTypeDto } from './dto/select-payment-type.dto';

@Controller('branch-accountant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchAccountantController {
  constructor(private readonly service: BranchAccountantService) {}

  @Get('invoices')
  @Roles(Role.ACCOUNTANT, Role.OWNER, Role.CEO)
  listInvoices(@CurrentUser() user: AuthUser, @Query() query: BranchAccountantInvoiceQueryDto) {
    return this.service.listInvoices(user, query);
  }

  @Get('pending-orders')
  @Roles(Role.ACCOUNTANT)
  listPendingOrders(@CurrentUser() user: AuthUser) {
    return this.service.listPendingConfirmedOrders(user);
  }

  @Post('pending-orders/:requestId/create-invoice')
  @Roles(Role.ACCOUNTANT)
  createInvoiceFromOrder(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.service.createInvoiceFromConfirmedOrder(user, requestId);
  }

  @Get('invoices/:id')
  @Roles(Role.ACCOUNTANT, Role.OWNER, Role.CEO)
  getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getInvoice(user, id);
  }

  @Post('invoices/:id/select-payment-type')
  @Roles(Role.ACCOUNTANT)
  selectPaymentType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SelectPaymentTypeDto,
  ) {
    return this.service.selectPaymentType(user, id, dto);
  }

  @Post('invoices/:id/installment-request')
  @Roles(Role.ACCOUNTANT)
  requestInstallment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BranchAccountantInstallmentRequestDto,
  ) {
    return this.service.requestInstallment(user, id, dto);
  }

  @Post('invoices/:id/send-to-cashier')
  @Roles(Role.ACCOUNTANT)
  sendToCashier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.sendToCashier(user, id);
  }

  @Get('invoices/:id/early-payment-requests')
  @Roles(Role.ACCOUNTANT)
  listEarlyPaymentRequests(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listEarlyPaymentRequests(user, id);
  }

  @Post('invoices/:id/early-payment-request')
  @Roles(Role.ACCOUNTANT)
  createEarlyPaymentRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateInstallmentEarlyPaymentDto,
  ) {
    return this.service.createEarlyPaymentRequest(user, id, dto);
  }

  @Post('invoices/:id/early-payment-requests/:requestId/send-to-cashier')
  @Roles(Role.ACCOUNTANT)
  sendEarlyPaymentToCashier(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    return this.service.sendEarlyPaymentToCashier(user, id, requestId);
  }
}

@Controller('branch-cashier')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchCashierController {
  constructor(private readonly service: BranchAccountantService) {}

  @Get('invoices')
  @Roles(Role.CASHIER, Role.OWNER, Role.CEO)
  listInvoices(@CurrentUser() user: AuthUser, @Query() query: BranchAccountantInvoiceQueryDto) {
    return this.service.listCashierInvoices(user, query);
  }

  @Get('invoices/:id')
  @Roles(Role.CASHIER, Role.OWNER, Role.CEO)
  getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getCashierInvoice(user, id);
  }

  @Post('invoices/:id/payments')
  @Roles(Role.CASHIER)
  submitPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddBranchPaymentDto,
  ) {
    return this.service.submitCashierPayment(user, id, dto);
  }

  @Get('installments')
  @Roles(Role.CASHIER, Role.OWNER, Role.CEO)
  listInstallments(@CurrentUser() user: AuthUser, @Query() query: BranchAccountantInvoiceQueryDto) {
    return this.service.listCashierInstallments(user, query);
  }

  @Get('installments/:id')
  @Roles(Role.CASHIER, Role.OWNER, Role.CEO)
  getInstallment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getCashierInstallment(user, id);
  }

  @Post('installments/:id/payments')
  @Roles(Role.CASHIER)
  submitInstallmentPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddBranchPaymentDto,
  ) {
    return this.service.submitCashierInstallmentPayment(user, id, dto);
  }
}
