import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { BranchInstallmentEarlyPaymentService } from './branch-installment-early-payment.service';
import { DistributionController } from './distribution.controller';
import { DistributionService } from './distribution.service';

@Module({
  imports: [InventoryModule, PricingModule, NotificationsModule, FinanceModule],
  controllers: [DistributionController],
  providers: [DistributionService, BranchInstallmentEarlyPaymentService],
  exports: [DistributionService, BranchInstallmentEarlyPaymentService],
})
export class DistributionModule {}
