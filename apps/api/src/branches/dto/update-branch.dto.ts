import { BranchStatus, BranchType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

function emptyStringToNull({ value }: { value: unknown }) {
  if (value === '') return null;
  return value;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @IsOptional()
  @IsEnum(BranchType, { message: 'Указан некорректный тип филиала' })
  branchType?: BranchType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  openedAt?: Date;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  assignedHqWarehouseId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  priceProfileId?: string | null;

  @IsOptional()
  @IsString()
  branchTypeChangeReasonCode?: string;

  @IsOptional()
  @IsString()
  branchTypeChangeReasonComment?: string;
}
