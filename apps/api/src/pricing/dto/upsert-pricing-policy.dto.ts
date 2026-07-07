import { PricingPolicyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertPricingPolicyDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  hqCatalogProductId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePriceYuan!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  landedCostKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePriceKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hqBranchWholesalePriceKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailPriceKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingPriceKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumDiscountPercent!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(PricingPolicyStatus)
  status?: PricingPolicyStatus;
}

export class UpdatePricingPolicyDto extends UpsertPricingPolicyDto {}
