import { IsOptional, IsString } from 'class-validator';

export class ChinaReceivingQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsString()
  supplyManagerId?: string;

  @IsOptional()
  @IsString()
  hqWarehouseId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
