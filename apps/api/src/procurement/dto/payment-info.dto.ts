import { ProcurementPaymentInfoMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertPaymentInfoDto {
  @IsEnum(ProcurementPaymentInfoMethod)
  paymentMethod!: ProcurementPaymentInfoMethod;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  swiftCode?: string;

  @IsOptional()
  @IsString()
  bankAddress?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  /** Required when creating a new version after completed payments exist */
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
