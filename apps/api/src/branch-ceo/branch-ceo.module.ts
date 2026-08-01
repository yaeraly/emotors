import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { BranchCeoController } from './branch-ceo.controller';
import { BranchCeoService } from './branch-ceo.service';

@Module({
  imports: [DistributionModule],
  controllers: [BranchCeoController],
  providers: [BranchCeoService],
})
export class BranchCeoModule {}
