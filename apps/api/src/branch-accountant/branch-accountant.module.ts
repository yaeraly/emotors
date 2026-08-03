import { Module, forwardRef } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { SalesModule } from '../sales/sales.module';
import { BranchAccountantController, BranchCashierController } from './branch-accountant.controller';
import { BranchAccountantService } from './branch-accountant.service';

@Module({
  imports: [DistributionModule, forwardRef(() => SalesModule)],
  controllers: [BranchAccountantController, BranchCashierController],
  providers: [BranchAccountantService],
})
export class BranchAccountantModule {}
