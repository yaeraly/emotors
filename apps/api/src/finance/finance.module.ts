import { Module } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceController } from './finance.controller';
import { FinanceInvestmentsService } from './finance-investments.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceShiftsService } from './finance-shifts.service';
import { FinanceTransfersService } from './finance-transfers.service';

@Module({
  controllers: [FinanceController],
  providers: [
    FinanceLedgerService,
    FinanceAccountsService,
    FinanceTransfersService,
    FinanceInvestmentsService,
    FinanceShiftsService,
    FinanceReportsService,
  ],
  exports: [FinanceLedgerService, FinanceAccountsService],
})
export class FinanceModule {}
