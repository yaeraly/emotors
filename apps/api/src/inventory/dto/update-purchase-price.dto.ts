import { PurchasePriceChangeReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePurchasePriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePriceYuan!: number;

  @IsEnum(PurchasePriceChangeReason)
  reason!: PurchasePriceChangeReason;

  @IsOptional()
  @IsString()
  note?: string;
}
