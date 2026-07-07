import { Module } from '@nestjs/common';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingController } from './pricing.controller';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [PricingController],
  providers: [PricingService, PricingCatalogService, PricingFifoService],
  exports: [PricingService, PricingCatalogService, PricingFifoService],
})
export class PricingModule {}
