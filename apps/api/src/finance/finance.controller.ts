import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { FileAttachmentEntityType, FinanceAccountStatus, Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceDashboardService } from './finance-dashboard.service';
import { FinanceExpensesService } from './finance-expenses.service';
import { FinanceIncomeService } from './finance-income.service';
import { FinanceInvestmentsService } from './finance-investments.service';
import { FinancePaymentsService } from './finance-payments.service';
import { FinanceReconciliationService } from './finance-reconciliation.service';
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
import {
  CreateFinanceInvestmentDto,
  DeleteFinanceInvestmentDto,
  UpdateFinanceInvestmentDto,
} from './dto/create-finance-investment.dto';
import { CloseCashierShiftDto, OpenCashierShiftDto } from './dto/cashier-shift.dto';
import { FinanceReportQueryDto } from './dto/finance-report-query.dto';
import {
  ConfirmFinanceTransferDto,
  CreateFinanceTransferDto,
  FinanceTransferQueryDto,
  ReturnFinanceTransferDto,
  ReverseFinanceTransferDto,
  UpdateFinanceTransferDto,
} from './dto/finance-transfer.dto';
import { CreateFinanceExpenseDto } from './dto/create-finance-expense.dto';
import { CreateFinanceReconciliationDto } from './dto/create-finance-reconciliation.dto';
import { FinancePaymentsQueryDto } from './dto/finance-payments-query.dto';

const FINANCE_VIEW_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
  Role.ACCOUNTANT,
  Role.FRANCHISE_OWNER,
  Role.CASHIER,
] as const;

const FINANCE_TRANSFER_VIEW_ROLES = [
  ...FINANCE_VIEW_ROLES,
  Role.HQ_CASHIER,
] as const;

const FINANCE_TRANSFER_PREPARE_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.FINANCE_MANAGER,
  Role.HQ_ACCOUNTANT,
] as const;

const FINANCE_TRANSFER_CASHIER_ROLES = [
  Role.OWNER,
  Role.CEO,
  Role.HQ_CASHIER,
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
    private readonly dashboardService: FinanceDashboardService,
    private readonly paymentsService: FinancePaymentsService,
    private readonly incomeService: FinanceIncomeService,
    private readonly expensesService: FinanceExpensesService,
    private readonly reconciliationService: FinanceReconciliationService,
  ) {}

  @Get('dashboard')
  @Roles(...FINANCE_VIEW_ROLES)
  getDashboard(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.dashboardService.getDashboard(user, query);
  }

  @Get('payments')
  @Roles(...FINANCE_VIEW_ROLES)
  listPayments(@CurrentUser() user: AuthUser, @Query() query: FinancePaymentsQueryDto) {
    return this.paymentsService.listPayments(user, query);
  }

  @Get('payments/pending')
  @Roles(...FINANCE_VIEW_ROLES)
  listPendingPayments(@CurrentUser() user: AuthUser, @Query() query: FinancePaymentsQueryDto) {
    return this.paymentsService.listPendingPayments(user, query);
  }

  @Get('income')
  @Roles(...FINANCE_VIEW_ROLES)
  listIncome(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.incomeService.listIncome(user, query);
  }

  @Get('expenses')
  @Roles(...FINANCE_VIEW_ROLES)
  listExpenses(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.expensesService.listExpenses(user, query);
  }

  @Post('expenses')
  @Roles(...FINANCE_MANAGE_ROLES)
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceExpenseDto) {
    return this.expensesService.createExpense(user, dto);
  }

  @Get('reconciliations')
  @Roles(...FINANCE_VIEW_ROLES)
  listReconciliations(@CurrentUser() user: AuthUser, @Query() query: FinanceReportQueryDto) {
    return this.reconciliationService.listReconciliations(user, query);
  }

  @Post('reconciliations')
  @Roles(...FINANCE_MANAGE_ROLES)
  createReconciliation(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceReconciliationDto) {
    return this.reconciliationService.createReconciliation(user, dto);
  }

  @Post('reconciliations/:id/complete')
  @Roles(...FINANCE_MANAGE_ROLES)
  completeReconciliation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reconciliationService.completeReconciliation(user, id);
  }

  @Get('account-types')
  @Roles(...FINANCE_VIEW_ROLES)
  listAccountTypes() {
    return this.accountsService.listAccountTypes();
  }

  @Get('cashier-eligible-employees')
  @Roles(...FINANCE_MANAGE_ROLES)
  listCashierEligibleEmployees(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.accountsService.listCashierEligibleEmployees(user, branchId);
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
  @Roles(...FINANCE_TRANSFER_VIEW_ROLES)
  listTransfers(@CurrentUser() user: AuthUser, @Query() query: FinanceTransferQueryDto) {
    return this.transfersService.listTransfers(user, query);
  }

  @Get('transfers/cashier-queue')
  @Roles(...FINANCE_TRANSFER_CASHIER_ROLES)
  listTransferCashierQueue(@CurrentUser() user: AuthUser) {
    return this.transfersService.listCashierQueue(user);
  }

  @Get('transfers/:id')
  @Roles(...FINANCE_TRANSFER_VIEW_ROLES)
  getTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.getTransfer(user, id);
  }

  @Post('transfers')
  @Roles(...FINANCE_TRANSFER_PREPARE_ROLES)
  createTransfer(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceTransferDto) {
    return this.transfersService.createTransfer(user, dto);
  }

  @Put('transfers/:id')
  @Roles(...FINANCE_TRANSFER_PREPARE_ROLES)
  updateTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceTransferDto,
  ) {
    return this.transfersService.updateTransfer(user, id, dto);
  }

  @Post('transfers/:id/send-to-cashier')
  @Roles(...FINANCE_TRANSFER_PREPARE_ROLES)
  sendTransferToCashier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.sendToCashier(user, id);
  }

  @Post('transfers/:id/return')
  @Roles(...FINANCE_TRANSFER_CASHIER_ROLES)
  returnTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReturnFinanceTransferDto,
  ) {
    return this.transfersService.returnToAccountant(user, id, dto);
  }

  @Post('transfers/:id/confirm')
  @Roles(...FINANCE_TRANSFER_CASHIER_ROLES)
  confirmTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmFinanceTransferDto,
  ) {
    return this.transfersService.confirmTransfer(user, id, dto);
  }

  @Post('transfers/:id/cancel')
  @Roles(...FINANCE_TRANSFER_PREPARE_ROLES)
  cancelTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.cancelTransfer(user, id);
  }

  @Post('transfers/:id/reverse')
  @Roles(Role.OWNER, Role.CEO, Role.FINANCE_MANAGER)
  reverseTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReverseFinanceTransferDto,
  ) {
    return this.transfersService.reverseTransfer(user, id, dto);
  }

  @Post('transfers/:id/attachments/support')
  @Roles(...FINANCE_TRANSFER_PREPARE_ROLES)
  uploadTransferSupport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transfersService.uploadAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.FINANCE_TRANSFER_SUPPORT,
    );
  }

  @Post('transfers/:id/attachments/receipt')
  @Roles(...FINANCE_TRANSFER_CASHIER_ROLES)
  uploadTransferReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.transfersService.uploadAttachment(
      user,
      id,
      request,
      FileAttachmentEntityType.FINANCE_TRANSFER_RECEIPT,
    );
  }

  /** @deprecated Prefer confirm with receipt */
  @Post('transfers/:id/approve')
  @Roles(...FINANCE_TRANSFER_CASHIER_ROLES)
  approveTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfersService.approveTransfer(user, id);
  }

  @Get('investments')
  @Roles(...FINANCE_VIEW_ROLES)
  listInvestments(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.investmentsService.listInvestments(user, { branchId, includeDeleted });
  }

  @Get('investments/:id')
  @Roles(...FINANCE_VIEW_ROLES)
  getInvestment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investmentsService.getInvestment(user, id);
  }

  @Post('investments')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  createInvestment(@CurrentUser() user: AuthUser, @Body() dto: CreateFinanceInvestmentDto) {
    return this.investmentsService.createInvestment(user, dto);
  }

  @Patch('investments/:id')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  updateInvestment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceInvestmentDto,
  ) {
    return this.investmentsService.updateInvestment(user, id, dto);
  }

  @Delete('investments/:id')
  @Roles(Role.OWNER, Role.CEO, Role.FRANCHISE_OWNER)
  deleteInvestment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeleteFinanceInvestmentDto,
  ) {
    return this.investmentsService.deleteInvestment(user, id, dto);
  }

  @Get('shifts')
  @Roles(...FINANCE_VIEW_ROLES)
  listShifts(@CurrentUser() user: AuthUser, @Query('accountId') accountId?: string) {
    return this.shiftsService.listShifts(user, accountId);
  }

  @Post('shifts/open')
  @Roles(Role.CASHIER, Role.MANAGER, Role.MASTER, Role.FRANCHISE_OWNER, Role.SALESPERSON)
  openShift(@CurrentUser() user: AuthUser, @Body() dto: OpenCashierShiftDto) {
    return this.shiftsService.openShift(user, dto);
  }

  @Post('shifts/:id/close')
  @Roles(Role.CASHIER, Role.MANAGER, Role.MASTER, Role.FRANCHISE_OWNER, Role.SALESPERSON)
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
