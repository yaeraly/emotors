import { InventoryCountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInventoryCountDto {
  @IsString()
  @MinLength(1)
  warehouseId!: string;

  @IsEnum(InventoryCountType)
  inventoryType!: InventoryCountType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  shelf?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  filterCategoryId?: string;

  @IsOptional()
  @IsString()
  filterShelf?: string;

  @IsOptional()
  @IsString()
  filterZone?: string;

  @IsOptional()
  @IsString()
  filterBrand?: string;

  @IsOptional()
  @IsString()
  filterSupplierId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filterProductIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInventoryCountItemDto {
  @Type(() => Number)
  actualQuantity!: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class BulkUpdateInventoryCountItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkInventoryCountItemEntry)
  items!: BulkInventoryCountItemEntry[];
}

export class BulkInventoryCountItemEntry {
  @IsString()
  itemId!: string;

  @Type(() => Number)
  actualQuantity!: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class RejectInventoryCountDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
