import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SendDistributionOrderDto {
  @IsOptional()
  @IsString()
  transportCompany?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  transportNotes?: string;
}
