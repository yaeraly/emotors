import { BranchType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateBranchPricingDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hqToBranchMarkupPercent?: number;

  @IsOptional()
  reason?: string;
}

export class UpdateRetailPricingDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailMarkupPercent!: number;

  @IsOptional()
  reason?: string;
}

export class UpdateWholesalePricingDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumWholesaleMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedWholesaleMarkupPercent!: number;

  @IsOptional()
  reason?: string;
}

export class PricingHistoryQueryDto {
  @IsOptional()
  productId?: string;

  @IsOptional()
  branchId?: string;

  @IsOptional()
  changedById?: string;

  @IsOptional()
  dateFrom?: string;

  @IsOptional()
  dateTo?: string;
}

export { BranchType };
