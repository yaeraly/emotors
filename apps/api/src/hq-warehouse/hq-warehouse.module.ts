import { Module } from '@nestjs/common';
import { HqWarehouseController } from './hq-warehouse.controller';
import { HqWarehouseService } from './hq-warehouse.service';

@Module({
  controllers: [HqWarehouseController],
  providers: [HqWarehouseService],
  exports: [HqWarehouseService],
})
export class HqWarehouseModule {}
