import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { HqStockBookingService } from './hq-stock-booking.service';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, HqStockBookingService],
  exports: [InventoryService, HqStockBookingService],
})
export class InventoryModule {}
