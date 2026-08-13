import { Module } from '@nestjs/common';
import { BranchWarehouseController } from './branch-warehouse.controller';
import { BranchWarehouseService } from './branch-warehouse.service';
import { BranchWarehouseOperatorController } from './branch-warehouse-operator.controller';

@Module({
  controllers: [BranchWarehouseController, BranchWarehouseOperatorController],
  providers: [BranchWarehouseService],
  exports: [BranchWarehouseService],
})
export class BranchWarehouseModule {}
