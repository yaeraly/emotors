import { ProcurementKgsAdjustmentReason, ProcurementSupplierPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateSupplierPaymentDto {
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountYuan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  approvedAmountKgs?: number;

  @ValidateIf((dto: UpdateSupplierPaymentDto) => dto.approvedAmountKgs != null)
  @IsOptional()
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
  allowOverpayment?: boolean;

  @IsOptional()
  @IsBoolean()
  sendToCashier?: boolean;

  @IsString()
  @IsNotEmpty({ message: 'Change reason is required' })
  @MinLength(3, { message: 'Change reason must be at least 3 characters' })
  changeReason!: string;
}
