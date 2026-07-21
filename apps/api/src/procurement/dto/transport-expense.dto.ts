import { TransportExpenseType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTransportExpenseDto {
  @IsOptional()
  @IsString()
  procurementOrderId?: string;

  @IsEnum(TransportExpenseType)
  expenseType!: TransportExpenseType;

  @IsString()
  @MinLength(1)
  supplierCarrier!: string;

  @IsOptional()
  @IsString()
  transportCompanyId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  sendToAccountant?: boolean;
}

export class UpdateTransportExpenseDto {
  @IsOptional()
  @IsEnum(TransportExpenseType)
  expenseType?: TransportExpenseType;

  @IsOptional()
  @IsString()
  supplierCarrier?: string;

  @IsOptional()
  @IsString()
  transportCompanyId?: string | null;

  @IsOptional()
  @IsString()
  invoiceNumber?: string | null;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;
}

export class ApproveTransportExpenseDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  financeAccountId?: string;

  @IsOptional()
  @IsString()
  accountantComment?: string;

  @IsOptional()
  sendToCashier?: boolean;
}

export class ConfirmTransportExpenseDto {
  @IsString()
  financeAccountId!: string;

  @IsOptional()
  @IsString()
  transactionNumber?: string;

  @IsOptional()
  @IsString()
  cashierComment?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ReturnTransportExpenseDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
