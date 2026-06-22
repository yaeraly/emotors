import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AddPartsDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsString()
  @MinLength(1)
  warehouseId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
