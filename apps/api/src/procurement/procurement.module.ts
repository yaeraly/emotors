import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { LandedCostEngineService } from './landed-cost/landed-cost-engine.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [InventoryModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, LandedCostEngineService],
  exports: [ProcurementService, LandedCostEngineService],
})
export class ProcurementModule {}
