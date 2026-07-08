import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetLaborCostDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  laborCost!: number;

  @IsOptional()
  @IsString()
  repairDescription?: string;
}
