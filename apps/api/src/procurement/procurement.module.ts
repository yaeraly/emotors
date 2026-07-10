import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { LandedCostModule } from './landed-cost.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [InventoryModule, LandedCostModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService, LandedCostModule],
})
export class ProcurementModule {}
