import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCargoReceiptDto {
  @IsOptional()
  @IsString()
  chinaExportTransportCompanyId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoTotalWeightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoRateUsdPerKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultUsdRate?: number;

  @IsOptional()
  @IsString()
  cargoReceiptNumber?: string;

  @IsOptional()
  @IsString()
  cargoReceiptDate?: string;

  @IsOptional()
  @IsString()
  cargoReceiptNote?: string;
}
