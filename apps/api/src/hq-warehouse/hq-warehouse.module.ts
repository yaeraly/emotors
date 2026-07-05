import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { HqWarehouseController } from './hq-warehouse.controller';
import { HqWarehouseService } from './hq-warehouse.service';

@Module({
  imports: [InventoryModule],
  controllers: [HqWarehouseController],
  providers: [HqWarehouseService],
  exports: [HqWarehouseService],
})
export class HqWarehouseModule {}
