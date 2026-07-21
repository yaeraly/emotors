import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

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
}
