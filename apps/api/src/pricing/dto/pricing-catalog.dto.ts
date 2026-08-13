import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCategoryMarkupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesaleMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hqBranchWholesaleMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingMarkupPercent!: number;

  @IsOptional()
  reason?: string;
}

export class UpdateProductPricingDto {
  @IsOptional()
  pricingMode?: 'AUTO' | 'MANUAL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePriceKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hqBranchWholesalePriceKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailPriceKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingPriceKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesaleMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hqBranchWholesaleMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingMarkupPercent?: number;

  @IsOptional()
  reason?: string;
}
