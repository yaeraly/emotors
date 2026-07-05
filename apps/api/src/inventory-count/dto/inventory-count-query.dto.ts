import { InventoryCountStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class InventoryCountQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(InventoryCountStatus)
  status?: InventoryCountStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
