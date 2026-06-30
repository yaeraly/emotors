import { ProcurementSupplierPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplierPaymentDto {
  @IsDateString()
  paymentDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountYuan!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate!: number;

  @IsEnum(ProcurementSupplierPaymentMethod)
  paymentMethod!: ProcurementSupplierPaymentMethod;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  allowOverpayment?: boolean;
}
