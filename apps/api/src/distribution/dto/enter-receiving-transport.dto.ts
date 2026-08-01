import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EnterReceivingTransportDto {
  @IsOptional()
  @IsString()
  transportCompany?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryDocument?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  /** Branch transport cost in KGS. Zero is allowed (free delivery). */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
