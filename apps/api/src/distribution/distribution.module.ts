import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DistributionController } from './distribution.controller';
import { DistributionService } from './distribution.service';

@Module({
  imports: [InventoryModule],
  controllers: [DistributionController],
  providers: [DistributionService],
})
export class DistributionModule {}
