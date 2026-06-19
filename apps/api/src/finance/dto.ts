import { FinanceTransactionType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CashboxDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  name: string;
}

export class MoneyEntryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  cashboxId?: string;

  @IsString()
  title: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class FinanceTransactionDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  cashboxId?: string;

  @IsEnum(FinanceTransactionType)
  type: FinanceTransactionType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
