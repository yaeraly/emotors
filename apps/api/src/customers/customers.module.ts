import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LoyaltyProgramSettingsService } from './loyalty-program-settings.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, LoyaltyProgramSettingsService],
  exports: [CustomersService, LoyaltyProgramSettingsService],
})
export class CustomersModule {}
