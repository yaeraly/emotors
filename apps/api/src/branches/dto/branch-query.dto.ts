import { BranchStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class BranchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @IsOptional()
  @IsString()
  ownerName?: string;
}
