import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateBranchPricingPolicyDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardMinKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardMaxKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  silverMinKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  silverMaxKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  goldMinKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  goldMaxKgs!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vipMinKgs!: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vipMaxKgs?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  retailStandardMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  retailSilverMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  retailGoldMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  retailVipMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  masterStandardMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  masterSilverMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  masterGoldMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  masterVipMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  wholesaleStandardMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  wholesaleSilverMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  wholesaleGoldMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  wholesaleVipMarkupPercent!: number;

  /** @deprecated Prefer matrix fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  standardMarkupPercent?: number;

  /** @deprecated Prefer matrix fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  silverMarkupPercent?: number;

  /** @deprecated Prefer matrix fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goldMarkupPercent?: number;

  /** @deprecated Prefer matrix fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vipMarkupPercent?: number;
}
