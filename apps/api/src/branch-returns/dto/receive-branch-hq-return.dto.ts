import { BranchHqReturnCondition } from '@prisma/client';
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

export class ReceiveBranchHqReturnItemDto {
  @IsString()
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedQuantity!: number;

  @IsEnum(BranchHqReturnCondition)
  condition!: BranchHqReturnCondition;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReceiveBranchHqReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveBranchHqReturnItemDto)
  items!: ReceiveBranchHqReturnItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
