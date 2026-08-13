import { FinanceTransferStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFinanceTransferDto {
  @IsString()
  sourceAccountId!: string;

  @IsString()
  destinationAccountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendToCashier?: boolean;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /** @deprecated legacy flag; HQ workflow always uses cashier confirmation */
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdateFinanceTransferDto {
  @IsOptional()
  @IsString()
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  destinationAccountId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendToCashier?: boolean;
}

export class ConfirmFinanceTransferDto {
  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  transactionNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expectedVersion?: number;
}

export class ReturnFinanceTransferDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class ReverseFinanceTransferDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class FinanceTransferQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(FinanceTransferStatus)
  status?: FinanceTransferStatus;

  @IsOptional()
  @IsString()
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  destinationAccountId?: string;

  @IsOptional()
  @IsString()
  accountantId?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
