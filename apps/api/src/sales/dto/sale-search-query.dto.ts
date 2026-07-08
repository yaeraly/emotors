import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SaleCustomerSearchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}

export class SaleProductSearchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
