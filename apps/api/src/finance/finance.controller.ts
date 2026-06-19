import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { CashboxDto, FinanceTransactionDto, MoneyEntryDto } from './dto';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('FINANCE')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.financeService.summary(user);
  }

  @Post('cashboxes')
  createCashbox(@CurrentUser() user: AuthUser, @Body() dto: CashboxDto) {
    return this.financeService.createCashbox(user, dto);
  }

  @Get('cashboxes')
  listCashboxes(@CurrentUser() user: AuthUser) {
    return this.financeService.listCashboxes(user);
  }

  @Post('incomes')
  createIncome(@CurrentUser() user: AuthUser, @Body() dto: MoneyEntryDto) {
    return this.financeService.createIncome(user, dto);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: MoneyEntryDto) {
    return this.financeService.createExpense(user, dto);
  }

  @Post('transactions')
  createTransaction(
    @CurrentUser() user: AuthUser,
    @Body() dto: FinanceTransactionDto,
  ) {
    return this.financeService.createTransaction(user, dto);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: AuthUser) {
    return this.financeService.listTransactions(user);
  }

  @Get('reports/debt')
  debtReport(@CurrentUser() user: AuthUser) {
    return this.financeService.debtReport(user);
  }

  @Get('reports/cashflow')
  cashflow(@CurrentUser() user: AuthUser) {
    return this.financeService.cashflow(user);
  }

  @Get('reports/profit')
  profit(@CurrentUser() user: AuthUser) {
    return this.financeService.profit(user);
  }

  @Get('reports/abc')
  abc(@CurrentUser() user: AuthUser) {
    return this.financeService.productAnalysis(user);
  }

  @Get('reports/xyz')
  xyz(@CurrentUser() user: AuthUser) {
    return this.financeService.productAnalysis(user);
  }

  @Get('reports/margin')
  margin(@CurrentUser() user: AuthUser) {
    return this.financeService.productAnalysis(user);
  }
}
