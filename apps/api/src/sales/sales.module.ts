import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [InventoryModule, CommissionsModule, PricingModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
