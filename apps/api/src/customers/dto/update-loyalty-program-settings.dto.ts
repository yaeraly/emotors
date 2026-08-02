import { LoyaltyPurchaseWindow } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateLoyaltyProgramSettingsDto {
  @IsOptional()
  @IsEnum(LoyaltyPurchaseWindow)
  purchaseWindow?: LoyaltyPurchaseWindow;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardThresholdKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  silverThresholdKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  goldThresholdKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vipThresholdKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardMaxKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  silverMaxKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  goldMaxKgs?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vipMaxKgs?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  standardMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  silverMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goldMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vipMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minAllowedMarkupPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxAllowedMarkupPercent?: number;

  @IsOptional()
  @IsBoolean()
  branchCustomizationEnabled?: boolean;

  /** @deprecated Prefer markup fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  standardDiscountPercent?: number;

  /** @deprecated Prefer markup fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  silverDiscountPercent?: number;

  /** @deprecated Prefer markup fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goldDiscountPercent?: number;

  /** @deprecated Prefer markup fields */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vipDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  allowDowngrade?: boolean;
}
