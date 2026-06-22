import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';

@Module({
  imports: [InventoryModule],
  controllers: [ServiceController],
  providers: [ServiceService],
})
export class ServiceModule {}
