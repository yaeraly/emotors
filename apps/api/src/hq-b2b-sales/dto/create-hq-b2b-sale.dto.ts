import { CustomerStatus, CustomerType, HqB2bPaymentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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

export class CreateHqB2bSaleItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateHqB2bInstallmentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  downPayment!: number;

  @IsDateString()
  installmentStartDate!: string;

  @IsString()
  @MinLength(1)
  paymentFrequency!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberOfPayments!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateHqB2bSaleDto {
  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @IsEnum(CustomerType)
  expectedCustomerType!: CustomerType;

  @IsString()
  customerId!: string;

  @IsEnum(HqB2bPaymentType)
  paymentType!: HqB2bPaymentType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateHqB2bSaleItemDto)
  items!: CreateHqB2bSaleItemDto[];

  @ValidateIf((dto: CreateHqB2bSaleDto) => dto.paymentType === HqB2bPaymentType.INSTALLMENT)
  @ValidateNested()
  @Type(() => CreateHqB2bInstallmentDto)
  installment?: CreateHqB2bInstallmentDto;

  @IsOptional()
  @IsString()
  notes?: string;
}
