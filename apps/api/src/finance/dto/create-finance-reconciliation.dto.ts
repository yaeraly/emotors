import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFinanceReconciliationDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualBalance!: number;

  @IsOptional()
  @IsDateString()
  statementDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
