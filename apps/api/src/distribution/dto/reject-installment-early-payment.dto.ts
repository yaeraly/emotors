import { IsString, MinLength } from 'class-validator';

export class RejectInstallmentEarlyPaymentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
