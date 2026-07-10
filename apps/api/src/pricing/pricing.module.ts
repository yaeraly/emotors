import { Module } from '@nestjs/common';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingController } from './pricing.controller';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingOverrideService } from './pricing-override.service';
import { PricingProfileService } from './pricing-profile.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingCatalogService,
    PricingFifoService,
    PricingProfileService,
    PricingOverrideService,
  ],
  exports: [
    PricingService,
    PricingCatalogService,
    PricingFifoService,
    PricingProfileService,
    PricingOverrideService,
  ],
})
export class PricingModule {}
