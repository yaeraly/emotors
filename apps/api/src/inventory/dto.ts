import { StockMovementType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  name: string;

  @IsString()
  sku: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePriceYuan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  latestYuanRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPriceKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePriceYuan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  latestYuanRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPriceKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;
}

export class WarehouseDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  name: string;

  @IsString()
  code: string;
}

export class StockMovementDto {
  @IsString()
  productId: string;

  @IsString()
  warehouseId: string;

  @IsEnum(StockMovementType)
  type: StockMovementType;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class YuanRateDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsNumber()
  @Min(0)
  rate: number;
}
