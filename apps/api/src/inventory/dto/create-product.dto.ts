import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

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
  barcode?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  defaultSupplierId?: string;

  @IsOptional()
  @IsString()
  defaultFactoryId?: string;

  @Type(() => Number)
  @IsNumber()
  weightKg!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePriceYuan!: number;

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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
