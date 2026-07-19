import { PaymentMethod, PriceAboveRecommendedReasonCode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  productName!: string;

  @IsOptional()
  @IsString()
  productSku?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsEnum(PriceAboveRecommendedReasonCode)
  priceAboveRecommendedReasonCode?: PriceAboveRecommendedReasonCode;

  @ValidateIf(
    (item: CreateSaleItemDto) =>
      item.priceAboveRecommendedReasonCode === PriceAboveRecommendedReasonCode.OTHER,
  )
  @IsString()
  @MinLength(1)
  priceAboveRecommendedComment?: string;

  @IsOptional()
  @IsEnum({ RETAIL: 'RETAIL', WHOLESALE: 'WHOLESALE' })
  pricingChannel?: 'RETAIL' | 'WHOLESALE';
}

export class CreateSaleDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  saleDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentDays?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum({ FULL_PAYMENT: 'FULL_PAYMENT', INSTALLMENT: 'INSTALLMENT' })
  paymentType?: 'FULL_PAYMENT' | 'INSTALLMENT';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  downPayment?: number;
}
