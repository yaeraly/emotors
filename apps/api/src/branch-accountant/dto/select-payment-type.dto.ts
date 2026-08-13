import { BranchInvoicePaymentType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SelectPaymentTypeDto {
  @IsEnum(BranchInvoicePaymentType)
  paymentType!: BranchInvoicePaymentType;
}
