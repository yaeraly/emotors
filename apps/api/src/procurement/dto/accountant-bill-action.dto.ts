import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class PostponeBillPaymentDto {
  @IsDateString()
  nextPaymentDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class PayBillCargoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paymentAmountKgs!: number;

  @IsString()
  financeAccountId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRateCnyKgs?: number;

  @IsOptional()
  @IsString()
  accountantComment?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  payRemainder?: boolean;

  @IsOptional()
  @IsBoolean()
  partialPayment?: boolean;
}

export class ReturnBillForCorrectionDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
