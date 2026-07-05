import { IsOptional, IsString } from 'class-validator';

export class SendToWarehouseDto {
  @IsOptional()
  @IsString()
  assignedWarehouseManagerId?: string;
}
