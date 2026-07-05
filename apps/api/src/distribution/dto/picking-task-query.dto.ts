import { HqWarehousePickingTaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PickingTaskQueryDto {
  @IsOptional()
  @IsString()
  sourceHqWarehouseId?: string;

  @IsOptional()
  @IsEnum(HqWarehousePickingTaskStatus)
  status?: HqWarehousePickingTaskStatus;
}
