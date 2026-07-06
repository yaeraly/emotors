import { Module } from '@nestjs/common';
import { HqWarehouseModule } from '../hq-warehouse/hq-warehouse.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountService } from './inventory-count.service';

@Module({
  imports: [InventoryModule, HqWarehouseModule],
  controllers: [InventoryCountController],
  providers: [InventoryCountService],
})
export class InventoryCountModule {}
