import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { HqB2bPricingService } from './hq-b2b-pricing.service';
import { HqB2bSalesController } from './hq-b2b-sales.controller';
import { HqB2bSalesService } from './hq-b2b-sales.service';

@Module({
  imports: [PricingModule, NotificationsModule, BranchesModule],
  controllers: [HqB2bSalesController],
  providers: [HqB2bSalesService, HqB2bPricingService],
  exports: [HqB2bSalesService, HqB2bPricingService],
})
export class HqB2bSalesModule {}
