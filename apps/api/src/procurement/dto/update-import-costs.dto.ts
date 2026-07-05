import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateImportCostsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  customsCostKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  insuranceCostKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bankFeeCostKgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherExpenseKgs?: number;
}
