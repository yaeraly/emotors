import { BranchHqReturnCondition, BranchHqReturnReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBranchHqReturnItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(BranchHqReturnReason)
  reason!: BranchHqReturnReason;

  @IsEnum(BranchHqReturnCondition)
  condition!: BranchHqReturnCondition;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateBranchHqReturnDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBranchHqReturnItemDto)
  items!: CreateBranchHqReturnItemDto[];
}
