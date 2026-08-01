import { LoyaltyPurchaseWindow } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

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
  @Max(100)
  standardDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  silverDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  goldDiscountPercent?: number;

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
