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
  ValidateNested,
} from 'class-validator';
import {
  FullPaymentBonusTrigger,
  InstallmentBonusTrigger,
  SalesMotivationBonusType,
} from '@prisma/client';

export class PlanLevelDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salesThreshold!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonusAmount!: number;
}

export class AverageReceiptLevelDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  averageReceiptThreshold!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonusAmount!: number;
}

export class SaveSalesMotivationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fullPaymentCommissionPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fullPaymentMinCommission!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fullPaymentMaxCommission?: number | null;

  @IsDateString()
  fullPaymentEffectiveFrom!: string;

  @IsEnum(FullPaymentBonusTrigger)
  fullPaymentTrigger!: FullPaymentBonusTrigger;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installmentApprovalCommissionPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installmentRepaymentCommissionPercent!: number;

  @IsDateString()
  installmentEffectiveFrom!: string;

  @IsEnum(InstallmentBonusTrigger)
  installmentTrigger!: InstallmentBonusTrigger;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  returningCustomerDays!: number;

  @IsEnum(SalesMotivationBonusType)
  returningCustomerBonusType!: SalesMotivationBonusType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returningCustomerFixedAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returningCustomerPercent?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  averageReceiptMinCount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanLevelDto)
  planLevels!: PlanLevelDto[];

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => AverageReceiptLevelDto)
  averageReceiptLevels!: AverageReceiptLevelDto[];

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  recommendationSource?: string;
}
