import { ProcurementSupplierPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
  @IsEnum(ProcurementSupplierPaymentMethod)
  paymentMethod?: ProcurementSupplierPaymentMethod;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  allowOverpayment?: boolean;

  @IsString()
  @IsNotEmpty({ message: 'Change reason is required' })
  @MinLength(3, { message: 'Change reason must be at least 3 characters' })
  changeReason!: string;
}
