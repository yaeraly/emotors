import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { BranchAccountantController, BranchCashierController } from './branch-accountant.controller';
import { BranchAccountantService } from './branch-accountant.service';

@Module({
  imports: [DistributionModule],
  controllers: [BranchAccountantController, BranchCashierController],
  providers: [BranchAccountantService],
})
export class BranchAccountantModule {}
