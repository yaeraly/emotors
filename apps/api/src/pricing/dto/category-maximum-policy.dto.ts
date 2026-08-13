import { MaximumPricePolicy } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCategoryMaximumPolicyDto {
  @IsEnum(MaximumPricePolicy)
  defaultRetailMaximumPolicy!: MaximumPricePolicy;

  @IsEnum(MaximumPricePolicy)
  defaultWholesaleMaximumPolicy!: MaximumPricePolicy;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRetailMaximumMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultWholesaleMaximumMarkupPercent!: number;

  @IsOptional()
  reason?: string;
}
