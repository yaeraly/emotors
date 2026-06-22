import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateDistributionOrderItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateDistributionOrderDto {
  @IsString()
  @MinLength(1)
  branchId!: string;

  @IsString()
  @MinLength(1)
  sourceWarehouseId!: string;

  @IsString()
  @MinLength(1)
  destinationWarehouseId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDistributionOrderItemDto)
  items!: CreateDistributionOrderItemDto[];
}
