import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [InventoryModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
