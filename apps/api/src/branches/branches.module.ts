import { Module } from '@nestjs/common';
import { BranchWarehouseModule } from '../branch-warehouse/branch-warehouse.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [BranchWarehouseModule],
  controllers: [BranchesController],
  providers: [BranchesService],
})
export class BranchesModule {}
