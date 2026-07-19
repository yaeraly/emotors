import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EnterReceivingTransportDto {
  @IsString()
  transportCompany!: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryDocument?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  transportCostKgs!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  deliveryDate!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
