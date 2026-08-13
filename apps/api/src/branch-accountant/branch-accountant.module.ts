import { Module, forwardRef } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { FinanceModule } from '../finance/finance.module';
import { SalesModule } from '../sales/sales.module';
import { BranchAccountantController, BranchCashierController } from './branch-accountant.controller';
import { BranchAccountantService } from './branch-accountant.service';

@Module({
  imports: [DistributionModule, FinanceModule, forwardRef(() => SalesModule)],
  controllers: [BranchAccountantController, BranchCashierController],
  providers: [BranchAccountantService],
})
export class BranchAccountantModule {}
