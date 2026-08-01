import { BranchInstallmentEarlyPaymentType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInstallmentEarlyPaymentDto {
  @IsEnum(BranchInstallmentEarlyPaymentType)
  paymentType!: BranchInstallmentEarlyPaymentType;

  @IsNumber()
  @Min(0.01)
  requestedAmount!: number;

  @IsOptional()
  @IsString()
  financeAccountId?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
