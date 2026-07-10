import { BranchPriceProfileStatus, BranchPriceProfileType, BranchType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpsertBranchPriceProfileDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(BranchPriceProfileType)
  profileType!: BranchPriceProfileType;

  @IsOptional()
  @IsEnum(BranchType)
  branchType?: BranchType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultHqMarkupPercent?: number;

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
