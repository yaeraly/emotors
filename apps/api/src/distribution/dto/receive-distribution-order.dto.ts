import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReceiveDistributionOrderItemDto {
  @IsString()
  @MinLength(1)
  distributionOrderItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReceiveDistributionOrderDto {
  @IsString()
  @MinLength(1)
  warehouseId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveDistributionOrderItemDto)
  items!: ReceiveDistributionOrderItemDto[];
}
