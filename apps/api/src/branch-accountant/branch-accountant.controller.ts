import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { AddBranchPaymentDto } from '../distribution/dto/add-branch-payment.dto';
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
}
