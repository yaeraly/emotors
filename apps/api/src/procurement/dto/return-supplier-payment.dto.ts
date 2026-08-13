import { IsString, MinLength } from 'class-validator';

export class ReturnSupplierPaymentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
