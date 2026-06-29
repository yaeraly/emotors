import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [InventoryModule, ProcurementModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
