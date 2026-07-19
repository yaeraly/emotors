import { Module, OnModuleInit } from '@nestjs/common';
import { HqWarehouseModule } from '../hq-warehouse/hq-warehouse.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountService } from './inventory-count.service';

@Module({
  imports: [InventoryModule, HqWarehouseModule],
  controllers: [InventoryCountController],
  providers: [InventoryCountService],
})
export class InventoryCountModule implements OnModuleInit {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  onModuleInit() {
    void this.inventoryCountService.repairMisroutedBranchInventoryApprovals().catch(() => undefined);
  }
}
