import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { HqWarehouseModule } from '../hq-warehouse/hq-warehouse.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [InventoryModule, HqWarehouseModule, DistributionModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
