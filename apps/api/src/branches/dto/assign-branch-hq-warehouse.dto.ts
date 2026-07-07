import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AssignBranchHqWarehouseDto {
  @IsOptional()
  @IsString()
  assignedHqWarehouseId?: string | null;

  @IsOptional()
  @IsBoolean()
  confirmNoManager?: boolean;
}
