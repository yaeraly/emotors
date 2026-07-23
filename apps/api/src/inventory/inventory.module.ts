import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { InventoryController } from './inventory.controller';
import { HqStockBookingService } from './hq-stock-booking.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PricingModule],
  controllers: [InventoryController],
  providers: [InventoryService, HqStockBookingService],
  exports: [InventoryService, HqStockBookingService],
})
export class InventoryModule {}
