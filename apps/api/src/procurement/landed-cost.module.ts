import { Module } from '@nestjs/common';
import { LandedCostService } from './landed-cost.service';

@Module({
  providers: [LandedCostService],
  exports: [LandedCostService],
})
export class LandedCostModule {}
