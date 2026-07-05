import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SvhToHqTransportStatus } from '@prisma/client';

export class UpdateSvhToHqTransportDto {
  @IsOptional()
  @IsString()
  transportCompanyId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportCostKgs?: number;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsString()
  dispatchDate?: string;

  @IsOptional()
  @IsString()
  arrivalDate?: string;

  @IsOptional()
  @IsEnum(SvhToHqTransportStatus)
  status?: SvhToHqTransportStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;
}
