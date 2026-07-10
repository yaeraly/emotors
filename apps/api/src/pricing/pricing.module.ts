import { Module } from '@nestjs/common';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingCategoryDiscountService } from './pricing-category-discount.service';
import { PricingController } from './pricing.controller';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingOverrideService } from './pricing-override.service';
import { PricingProfileService } from './pricing-profile.service';
import { PricingResolutionService } from './pricing-resolution.service';
import { PricingService } from './pricing.service';
import { PricingVersionService } from './pricing-version.service';

@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingCatalogService,
    PricingFifoService,
    PricingProfileService,
    PricingOverrideService,
    PricingCategoryDiscountService,
    PricingVersionService,
    PricingResolutionService,
  ],
  exports: [
    PricingService,
    PricingCatalogService,
    PricingFifoService,
    PricingProfileService,
    PricingOverrideService,
    PricingCategoryDiscountService,
    PricingVersionService,
    PricingResolutionService,
  ],
})
export class PricingModule {}
