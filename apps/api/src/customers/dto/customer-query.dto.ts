import { CustomerStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CustomerQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
