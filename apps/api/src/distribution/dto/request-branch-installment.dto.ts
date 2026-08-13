import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class RequestBranchInstallmentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstPaymentAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  termMonths!: number;

  @IsOptional()
  @IsBoolean()
  firstPaymentRequired?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectBranchInstallmentDto {
  @IsString()
  @MinLength(1)
  comment!: string;
}
