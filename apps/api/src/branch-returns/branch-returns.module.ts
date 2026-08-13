import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { BranchHqReturnController } from './branch-hq-return.controller';
import { BranchHqReturnService } from './branch-hq-return.service';

@Module({
  imports: [InventoryModule],
  controllers: [BranchHqReturnController],
  providers: [BranchHqReturnService],
  exports: [BranchHqReturnService],
})
export class BranchReturnsModule {}
