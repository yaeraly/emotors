import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SendInvoiceToAccountantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  expectedPaymentDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Total CNY amount Supply Manager requests HQ Accountant to pay. */
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  requestedPaymentYuan!: number;
}
