import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { FinanceAccountStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceInvestmentsService } from './finance-investments.service';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceShiftsService } from './finance-shifts.service';
import { FinanceTransfersService } from './finance-transfers.service';
import {
  AssignFinanceAccountDto,
  CreateFinanceAccountDto,
  FinanceAccountQueryDto,
  SetOpeningBalanceDto,
  UpdateFinanceAccountDto,
} from './dto/finance-account.dto';
import { CreateOwnerInvestmentDto } from './dto/create-owner-investment.dto';
import { CloseCashierShiftDto, OpenCashierShiftDto } from './dto/cashier-shift.dto';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';
import { CreateFinanceTransferDto, FinanceTransferQueryDto } from './dto/finance-transfer.dto';

const FINANCE_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
  Role.FRANCHISE_OWNER,
  Role.CASHIER,
] as const;

const FINANCE_MANAGE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
] as const;

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    private readonly accountsService: FinanceAccountsService,
    private readonly transfersService: FinanceTransfersService,
    private readonly investmentsService: FinanceInvestmentsService,
    private readonly shiftsService: FinanceShiftsService,
    private readonly reportsService: FinanceReportsService,
  ) {}

  @Get('account-types')
  @Roles(...FINANCE_VIEW_ROLES)
  listAccountTypes() {
    return this.accountsService.listAccountTypes();
  }

  @Get('accounts')
  @Roles(...FINANCE_VIEW_ROLES)
  listAccounts(@CurrentUser() user: AuthUser, @Query() query: FinanceAccountQueryDto) {
    return this.accountsService.listAccounts(user, query);
  }

  @Get('accounts/:id')
  @Roles(...FINANCE_VIEW_ROLES)
  getAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.getAccount(user, id);
  }

  @Post('accounts')
  @Roles(...FINANCE_MANAGE_ROLES)
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceAccountDto) {
    return this.accountsService.createAccount(user, dto);
  }

  @Put('accounts/:id')
  @Roles(...FINANCE_MANAGE_ROLES)
  updateAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceAccountDto,
  ) {
    return this.accountsService.updateAccount(user, id, dto);
  }

  @Patch('accounts/:id/activate')
  @Roles(...FINANCE_MANAGE_ROLES)
  activateAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.setAccountStatus(user, id, FinanceAccountStatus.ACTIVE);
  }

  @Patch('accounts/:id/deactivate')
  @Roles(...FINANCE_MANAGE_ROLES)
  deactivateAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.setAccountStatus(user, id, FinanceAccountStatus.INACTIVE);
  }

  @Post('accounts/:id/opening-balance')
  @Roles(...FINANCE_MANAGE_ROLES)
  setOpeningBalance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetOpeningBalanceDto,
  ) {
    return this.accountsService.setOpeningBalance(user, id, dto);
  }

  @Post('accounts/:id/assign')
  @Roles(...FINANCE_MANAGE_ROLES)
  assignAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignFinanceAccountDto,
  ) {
    return this.accountsService.assignAccount(user, id, dto);
  }

  @Post('accounts/:id/unassign/:userId')
  @Roles(...FINANCE_MANAGE_ROLES)
  unassignAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.accountsService.unassignAccount(user, id, userId);
  }

  @Get('transfers')
  @Roles(...FINANCE_VIEW_ROLES)
  listTransfers(@CurrentUser() user: AuthUser, @Query() query: FinanceTransferQueryDto) {
    return this.transfersService.listTransfers(user, query);
  }

  @Get('transfers/:id')
  @Roles(...FINANCE_VIEW_ROLES)
  getTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.getTransfer(user, id);
  }

  @Post('transfers')
  @Roles(...FINANCE_MANAGE_ROLES, Role.FRANCHISE_OWNER)
  createTransfer(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceTransferDto) {
    return this.transfersService.createTransfer(user, dto);
  }

  @Post('transfers/:id/approve')
  @Roles(Role.OWNER, Role.CEO, Role.FINANCE_MANAGER, Role.HQ_ACCOUNTANT, Role.FRANCHISE_OWNER)
  approveTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.approveTransfer(user, id);
  }

  @Get('investments')
  @Roles(...FINANCE_VIEW_ROLES)
  listInvestments(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.investmentsService.listInvestments(user, branchId);
  }

  @Post('investments')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  createInvestment(@CurrentUser() user: AuthUser, @Body() dto: CreateOwnerInvestmentDto) {
    return this.investmentsService.createOwnerInvestment(user, dto);
  }

  @Get('shifts')
  @Roles(...FINANCE_VIEW_ROLES)
  listShifts(@CurrentUser() user: AuthUser, @Query('accountId') accountId?: string) {
    return this.shiftsService.listShifts(user, accountId);
  }

  @Post('shifts/open')
  @Roles(Role.CASHIER)
  openShift(@CurrentUser() user: AuthUser, @Body() dto: OpenCashierShiftDto) {
    return this.shiftsService.openShift(user, dto);
  }

  @Post('shifts/:id/close')
  @Roles(Role.CASHIER)
  closeShift(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseCashierShiftDto,
  ) {
    return this.shiftsService.closeShift(user, id, dto);
  }

  @Get('reports/summary')
  @Roles(...FINANCE_VIEW_ROLES)
  getSummary(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.reportsService.getSummary(user, query);
  }

  @Get('reports/cash-flow')
  @Roles(...FINANCE_VIEW_ROLES)
  getCashFlow(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.reportsService.getCashFlow(user, query);
  }

  @Get('audit')
  @Roles(...FINANCE_VIEW_ROLES)
  listAudit(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.reportsService.listAudit(user, query);
  }
}
