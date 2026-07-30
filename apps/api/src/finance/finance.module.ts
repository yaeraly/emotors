import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceController } from './finance.controller';
import { FinanceDashboardService } from './finance-dashboard.service';
import { FinanceExpensesService } from './finance-expenses.service';
import { FinanceIncomeService } from './finance-income.service';
import { FinanceInvestmentsService } from './finance-investments.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinancePaymentsService } from './finance-payments.service';
import { FinanceReconciliationService } from './finance-reconciliation.service';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceShiftsService } from './finance-shifts.service';
import { FinanceTransfersService } from './finance-transfers.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FinanceController],
  providers: [
    FinanceLedgerService,
    FinanceAccountsService,
    FinanceTransfersService,
    FinanceInvestmentsService,
    FinanceShiftsService,
    FinanceReportsService,
    FinanceDashboardService,
    FinancePaymentsService,
    FinanceIncomeService,
    FinanceExpensesService,
    FinanceReconciliationService,
  ],
  exports: [FinanceLedgerService, FinanceAccountsService, FinanceExpensesService],
})
export class FinanceModule {}
