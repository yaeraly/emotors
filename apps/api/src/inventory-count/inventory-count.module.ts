import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryCountController } from './inventory-count.controller';
import { InventoryCountService } from './inventory-count.service';

@Module({
  imports: [InventoryModule],
  controllers: [InventoryCountController],
  providers: [InventoryCountService],
})
export class InventoryCountModule {}
