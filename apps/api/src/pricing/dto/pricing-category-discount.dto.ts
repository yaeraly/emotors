import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CategoryDiscountItemDto {
  @IsString()
  categoryId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercent!: number;
}

export class UpsertProfileCategoryDiscountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDiscountItemDto)
  discounts!: CategoryDiscountItemDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}
