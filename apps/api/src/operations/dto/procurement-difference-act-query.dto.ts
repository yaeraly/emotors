import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ShortageReportItemType, ShortageReportStatus } from '@prisma/client';

export class ProcurementDifferenceActQueryDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  factoryId?: string;

  @IsOptional()
  @IsEnum(ShortageReportItemType)
  type?: ShortageReportItemType;

  @IsOptional()
  @IsEnum(ShortageReportStatus)
  status?: ShortageReportStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
