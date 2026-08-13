import { ProcurementPaymentInfoMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SendInvoiceToAccountantDto {
  @IsOptional()
  @IsEnum(ProcurementPaymentInfoMethod)
  paymentMethod?: ProcurementPaymentInfoMethod;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * Optional override. When omitted, backend uses remaining unpaid CNY
   * (or full order total when nothing has been paid yet).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  requestedPaymentYuan?: number;
}
