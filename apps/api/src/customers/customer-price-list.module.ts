import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { CustomerPriceListController } from './customer-price-list.controller';
import { CustomerPriceListService } from './customer-price-list.service';
import { CustomersModule } from './customers.module';

@Module({
  imports: [PricingModule, CustomersModule],
  controllers: [CustomerPriceListController],
  providers: [CustomerPriceListService],
  exports: [CustomerPriceListService],
})
export class CustomerPriceListModule {}
