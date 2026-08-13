import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class PreviewRetailMarkupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumSellingMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedRetailMarkupPercent!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumRetailMarkupOverridePercent?: number | null;
}

export class PreviewWholesaleMarkupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumWholesaleMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedWholesaleMarkupPercent!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumWholesaleMarkupOverridePercent?: number | null;
}

export type MarkupPreviewResult = {
  productId: string;
  validationStatus: 'OK' | 'ERROR';
  validationErrors: string[];
  preview: {
    minimumPriceKgs: number;
    recommendedPriceKgs: number;
    maximumPriceKgs: number;
    effectiveMaximumMarkupPercent: number;
    inheritedMaximumMarkupPercent: number;
    maximumMarkupOverridePercent: number | null;
    maximumMarkupSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  } | null;
};
