import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { HqWarehouseAssignmentService } from './hq-warehouse-assignment.service';
import { HqSalesManagerAssignmentService } from './hq-sales-manager-assignment.service';
import { HqWarehouseController } from './hq-warehouse.controller';
import { HqWarehouseService } from './hq-warehouse.service';

@Module({
  imports: [InventoryModule, PricingModule],
  controllers: [HqWarehouseController],
  providers: [HqWarehouseService, HqWarehouseAssignmentService, HqSalesManagerAssignmentService],
  exports: [HqWarehouseService, HqWarehouseAssignmentService, HqSalesManagerAssignmentService],
})
export class HqWarehouseModule {}
