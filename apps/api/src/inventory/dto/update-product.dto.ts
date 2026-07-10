import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PurchasePriceChangeReason } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  characteristics?: unknown;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @IsOptional()
  @IsString()
  defaultSupplierId?: string;

  @IsOptional()
  @IsString()
  defaultFactoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsString()
  weightChangeReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePriceYuan?: number;

  @IsOptional()
  @IsEnum(PurchasePriceChangeReason)
  purchasePriceChangeReason?: PurchasePriceChangeReason;

  @IsOptional()
  @IsString()
  purchasePriceChangeNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latestYuanRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostPerKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPriceKgs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
