import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';

export class PreviewBranchPricingDto {
  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @IsEnum(CustomerLoyaltyCategory)
  loyaltyCategory!: CustomerLoyaltyCategory;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePriceKgs!: number;
}
