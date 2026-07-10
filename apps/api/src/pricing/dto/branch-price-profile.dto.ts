import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BranchPriceProfileStatus, BranchType } from '@prisma/client';

export class UpsertBranchPriceProfileDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(BranchType)
  branchType?: BranchType;

  @IsNumber()
  @Min(0)
  defaultHqMarkupPercent!: number;

  @IsOptional()
  @IsEnum(BranchPriceProfileStatus)
  status?: BranchPriceProfileStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignBranchPriceProfileDto {
  @IsOptional()
  @IsString()
  profileId?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;
}
