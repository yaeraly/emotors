import { Module } from '@nestjs/common';
import { BranchWarehouseModule } from '../branch-warehouse/branch-warehouse.module';
import { CustomersModule } from '../customers/customers.module';
import { DistributionModule } from '../distribution/distribution.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BranchCeoController } from './branch-ceo.controller';
import { BranchCeoService } from './branch-ceo.service';

@Module({
  imports: [InventoryModule, BranchWarehouseModule, DistributionModule, CustomersModule],
  controllers: [BranchCeoController],
  providers: [BranchCeoService],
})
export class BranchCeoModule {}
