import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePricingMasterSettingsDto {
  @IsOptional()
  @IsIn(['FIFO_COST'])
  baseCalculationSource?: string;

  @IsOptional()
  @IsIn(['ROUNDUP', 'ROUND_NEAREST', 'NONE'])
  roundingStrategy?: string;

  @IsOptional()
  @IsInt()
  @Min(-6)
  @Max(6)
  roundUpPrecision?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  defaultDecimalPrecision?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultMinimumMarkup?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultMaximumMarkup?: number;

  @IsOptional()
  @IsString()
  defaultActivationTimezone?: string;
}
