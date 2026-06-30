import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [InventoryController, ProductsController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
