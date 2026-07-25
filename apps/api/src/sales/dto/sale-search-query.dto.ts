import { CustomerType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class SaleCustomerSearchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;
}

export class SaleProductSearchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
