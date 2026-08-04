import { IsOptional, IsString } from 'class-validator';

export class ServiceCustomerSearchDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class ServiceProductSearchDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}
