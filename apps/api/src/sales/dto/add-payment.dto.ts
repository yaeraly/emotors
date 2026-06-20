import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;

  @IsOptional()
  @IsString()
  note?: string;
}
