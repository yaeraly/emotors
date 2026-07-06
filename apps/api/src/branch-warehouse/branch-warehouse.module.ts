import { Module } from '@nestjs/common';
import { BranchWarehouseController } from './branch-warehouse.controller';
import { BranchWarehouseService } from './branch-warehouse.service';

@Module({
  controllers: [BranchWarehouseController],
  providers: [BranchWarehouseService],
})
export class BranchWarehouseModule {}
