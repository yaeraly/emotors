import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EnterReceivingTransportDto {
  @IsString()
  transportCompany!: string;

  @IsOptional()
  @IsString()
  deliveryDocument?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportCostKgs!: number;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
