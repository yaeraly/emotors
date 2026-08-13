import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceExpenseStatus } from '@prisma/client';

export class CreateFinanceExpenseDto {
  @IsString()
  category!: string;

  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  payee?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class FinanceExpenseQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  status?: FinanceExpenseStatus;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  limit?: number;
}
