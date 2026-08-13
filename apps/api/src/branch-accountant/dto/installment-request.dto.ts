import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class BranchAccountantInstallmentRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstPaymentAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  comment?: string;
}
