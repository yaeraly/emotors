import { ProductPriceOverrideStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertProductPriceOverrideDto {
  @IsString()
  branchId!: string;

  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overridePriceKgs!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  approvedById?: string;
}

export class UpdateProductPriceOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overridePriceKgs?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export class ProductPriceOverrideQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(ProductPriceOverrideStatus)
  status?: ProductPriceOverrideStatus;
}
