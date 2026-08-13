import { BranchStatus, UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateBranchOwnerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  branchName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  branchCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  branchPhone?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  branchStatus?: BranchStatus;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
