import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class ConfirmSupplierPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  actualPaidKgs!: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  financeAccountId?: string;

  @IsOptional()
  @IsString()
  transactionNumber?: string;

  @IsOptional()
  @IsString()
  cashierComment?: string;

  @ValidateIf((dto: ConfirmSupplierPaymentDto) => dto.financeAccountId != null)
  @IsOptional()
  @IsString()
  @MinLength(3)
  accountChangeReason?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  actualPaidDifferenceReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
