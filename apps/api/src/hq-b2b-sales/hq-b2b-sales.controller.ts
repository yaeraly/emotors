import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomerType, HqB2bSaleStatus, Role } from '@prisma/client';
import { B2bCustomerType } from './hq-b2b-pricing.service';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { ApproveHqB2bInstallmentDto } from './dto/approve-hq-b2b-installment.dto';
import { ConfirmHqB2bPaymentDto } from './dto/confirm-hq-b2b-payment.dto';
import { CreateHqB2bCustomerDto } from './dto/create-hq-b2b-customer.dto';
import { CreateHqB2bSaleDto } from './dto/create-hq-b2b-sale.dto';
import { RejectHqB2bInstallmentDto } from './dto/reject-hq-b2b-installment.dto';
import { RejectHqB2bPaymentDto } from './dto/reject-hq-b2b-payment.dto';
import { HqB2bSalesService } from './hq-b2b-sales.service';

const HQ_SALES_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.HQ_SALES_MANAGER,
] as const;

const HQ_ACCOUNTANT_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.SYSTEM_ADMINISTRATOR,
  Role.HQ_ACCOUNTANT,
] as const;

const CEO_ROLES = [Role.OWNER, Role.CEO, Role.SYSTEM_ADMINISTRATOR] as const;

@Controller('hq-b2b-sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HqB2bSalesController {
  constructor(private readonly service: HqB2bSalesService) {}

  @Get()
  @Roles(...HQ_SALES_ROLES, Role.HQ_ACCOUNTANT, Role.WAREHOUSE_MANAGER, Role.FINANCE_MANAGER)
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: HqB2bSaleStatus,
    @Query('customerType') customerType?: CustomerType,
  ) {
    return this.service.list(user, { status, customerType });
  }

  @Get('payment-requests')
  @Roles(...HQ_ACCOUNTANT_ROLES)
  listPaymentRequests(@CurrentUser() user: AuthUser) {
    return this.service.listPaymentRequests(user);
  }

  @Get('products/search')
  @Roles(...HQ_SALES_ROLES)
  searchProducts(
    @CurrentUser() user: AuthUser,
    @Query('customerType') customerType: CustomerType,
    @Query('search') search?: string,
  ) {
    return this.service.searchProducts(user, customerType as B2bCustomerType, search);
  }

  @Get('customers/search')
  @Roles(...HQ_SALES_ROLES)
  searchCustomers(
    @CurrentUser() user: AuthUser,
    @Query('customerType') customerType: CustomerType,
    @Query('search') search?: string,
  ) {
    return this.service.searchCustomers(user, customerType, search);
  }

  @Post('customers')
  @Roles(...HQ_SALES_ROLES)
  createCustomer(@CurrentUser() user: AuthUser, @Body() dto: CreateHqB2bCustomerDto) {
    return this.service.createCustomer(user, dto);
  }

  @Post()
  @Roles(...HQ_SALES_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHqB2bSaleDto) {
    return this.service.createAndSubmit(user, dto);
  }

  @Get(':id')
  @Roles(...HQ_SALES_ROLES, Role.HQ_ACCOUNTANT, Role.WAREHOUSE_MANAGER)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post(':id/resubmit-payment')
  @Roles(...HQ_SALES_ROLES)
  resubmitPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.resubmitPayment(user, id);
  }

  @Post(':id/installment/approve')
  @Roles(...CEO_ROLES)
  approveInstallment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveHqB2bInstallmentDto,
  ) {
    return this.service.approveInstallment(user, id, dto);
  }

  @Post(':id/installment/reject')
  @Roles(...CEO_ROLES)
  rejectInstallment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectHqB2bInstallmentDto,
  ) {
    return this.service.rejectInstallment(user, id, dto);
  }

  @Post('payment-requests/:paymentRequestId/confirm')
  @Roles(...HQ_ACCOUNTANT_ROLES)
  confirmPayment(
    @CurrentUser() user: AuthUser,
    @Param('paymentRequestId') paymentRequestId: string,
    @Body() dto: ConfirmHqB2bPaymentDto,
  ) {
    return this.service.confirmPayment(user, paymentRequestId, dto);
  }

  @Post('payment-requests/:paymentRequestId/reject')
  @Roles(...HQ_ACCOUNTANT_ROLES)
  rejectPayment(
    @CurrentUser() user: AuthUser,
    @Param('paymentRequestId') paymentRequestId: string,
    @Body() dto: RejectHqB2bPaymentDto,
  ) {
    return this.service.rejectPayment(user, paymentRequestId, dto);
  }

  @Post('customers/:customerId/convert-to-franchise')
  @Roles(...CEO_ROLES)
  convertToFranchise(
    @CurrentUser() user: AuthUser,
    @Param('customerId') customerId: string,
    @Body() dto: { branchName?: string },
  ) {
    return this.service.convertCustomerToFranchise(user, customerId, dto);
  }
}
