import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { SaleInstallmentApprovalService } from './sale-installment-approval.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    InventoryModule,
    CommissionsModule,
    PricingModule,
    NotificationsModule,
    CustomersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SaleInstallmentApprovalService],
})
export class SalesModule {}
