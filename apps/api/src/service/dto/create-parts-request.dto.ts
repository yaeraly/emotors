import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class PartsRequestItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePartsRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartsRequestItemDto)
  items!: PartsRequestItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class IssuePartsRequestDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssuePartsRequestItemDto)
  items?: IssuePartsRequestItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}

class IssuePartsRequestItemDto {
  @IsString()
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
