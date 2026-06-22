import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';

@Module({
  imports: [InventoryModule, CommissionsModule],
  controllers: [ServiceController],
  providers: [ServiceService],
})
export class ServiceModule {}
