import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';

@Module({
  imports: [InventoryModule, CommissionsModule, PricingModule],
  controllers: [ServiceController],
  providers: [ServiceService],
})
export class ServiceModule {}
