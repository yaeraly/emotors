import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { HqWarehouseAssignmentService } from './hq-warehouse-assignment.service';
import { HqWarehouseController } from './hq-warehouse.controller';
import { HqWarehouseService } from './hq-warehouse.service';

@Module({
  imports: [InventoryModule],
  controllers: [HqWarehouseController],
  providers: [HqWarehouseService, HqWarehouseAssignmentService],
  exports: [HqWarehouseService, HqWarehouseAssignmentService],
})
export class HqWarehouseModule {}
