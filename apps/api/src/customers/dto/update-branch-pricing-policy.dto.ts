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
  standardMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  silverMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goldMarkupPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vipMarkupPercent!: number;
}
