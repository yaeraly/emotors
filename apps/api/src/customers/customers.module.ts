import { Module } from '@nestjs/common';
import { BranchPricingPolicyService } from './branch-pricing-policy.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LoyaltyProgramSettingsService } from './loyalty-program-settings.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, LoyaltyProgramSettingsService, BranchPricingPolicyService],
  exports: [CustomersService, LoyaltyProgramSettingsService, BranchPricingPolicyService],
})
export class CustomersModule {}
