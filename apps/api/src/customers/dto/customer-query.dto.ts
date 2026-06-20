import { CustomerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
