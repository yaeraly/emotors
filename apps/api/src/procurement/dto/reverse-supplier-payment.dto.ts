import { IsString, MinLength } from 'class-validator';

export class ReverseSupplierPaymentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
