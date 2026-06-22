import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AddDiagnosisDto {
  @IsString()
  @MinLength(1)
  problem!: string;

  @IsString()
  @MinLength(1)
  result!: string;

  @IsOptional()
  @IsString()
  recommendedRepair?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  diagnosisFee?: number;
}
