import { Module } from '@nestjs/common';
import { PricingCatalogService } from './pricing-catalog.service';
import { PricingCategoryDiscountService } from './pricing-category-discount.service';
import { PricingCategoryRuleService } from './pricing-category-rule.service';
import { PricingController } from './pricing.controller';
import { PricingEngineService } from './pricing-engine.service';
import { PricingFifoService } from './pricing-fifo.service';
import { PricingOverrideService } from './pricing-override.service';
import { PricingProductRuleService } from './pricing-product-rule.service';
import { PricingProfileService } from './pricing-profile.service';
import { PricingResolutionService } from './pricing-resolution.service';
import { PricingSchedulerService } from './pricing-scheduler.service';
import { PricingSettingsService } from './pricing-settings.service';
import { PricingSimulationService } from './pricing-simulation.service';
import { PricingService } from './pricing.service';
import { PricingValidationService } from './pricing-validation.service';
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
    PricingCategoryRuleService,
    PricingProductRuleService,
    PricingVersionService,
    PricingResolutionService,
    PricingEngineService,
    PricingSimulationService,
    PricingSchedulerService,
    PricingSettingsService,
    PricingValidationService,
  ],
  exports: [
    PricingService,
    PricingCatalogService,
    PricingFifoService,
    PricingProfileService,
    PricingOverrideService,
    PricingCategoryDiscountService,
    PricingCategoryRuleService,
    PricingProductRuleService,
    PricingVersionService,
    PricingResolutionService,
    PricingEngineService,
    PricingSimulationService,
    PricingSchedulerService,
    PricingSettingsService,
    PricingValidationService,
  ],
})
export class PricingModule {}
