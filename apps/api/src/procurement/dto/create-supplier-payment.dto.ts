import { ProcurementKgsAdjustmentReason, ProcurementSupplierPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateSupplierPaymentDto {
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountYuan!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  approvedAmountKgs?: number;

  @ValidateIf((dto: CreateSupplierPaymentDto) =>
    dto.approvedAmountKgs != null &&
    dto.amountYuan != null &&
    dto.exchangeRate != null &&
    Math.abs(Number(dto.approvedAmountKgs) - Number(dto.amountYuan) * Number(dto.exchangeRate)) > 0.009,
  )
  @IsEnum(ProcurementKgsAdjustmentReason)
  kgsAdjustmentReason?: ProcurementKgsAdjustmentReason;

  @IsOptional()
  @IsString()
  kgsAdjustmentComment?: string;

  @IsOptional()
  @IsEnum(ProcurementSupplierPaymentMethod)
  paymentMethod?: ProcurementSupplierPaymentMethod;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientCompany?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  swiftCode?: string;

  @IsOptional()
  @IsString()
  cardholderName?: string;

  @IsOptional()
  @IsString()
  cardNumber?: string;

  @IsOptional()
  @IsString()
  paymentInstructions?: string;

  @IsOptional()
  @IsDateString()
  paymentDeadline?: string;

  @IsOptional()
  @IsString()
  intendedFinanceAccountId?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  accountantComment?: string;

  @IsOptional()
  @IsBoolean()
  sendToCashier?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOverpayment?: boolean;

  @IsOptional()
  @IsBoolean()
  allowInsufficientBalance?: boolean;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
