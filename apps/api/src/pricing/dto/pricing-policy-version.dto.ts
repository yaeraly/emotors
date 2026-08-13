import { IsDateString, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { PricingChangeReasonCode } from '@prisma/client';

export class CreatePricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsEnum(PricingChangeReasonCode)
  changeReason?: PricingChangeReasonCode;

  @ValidateIf((dto: CreatePricingPolicyVersionDto) => dto.changeReason === PricingChangeReasonCode.OTHER)
  @IsString()
  @MinLength(1)
  changeReasonNote?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PublishPricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class SchedulePricingPolicyVersionDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  effectiveTimezone?: string;

  @IsOptional()
  @IsEnum(PricingChangeReasonCode)
  changeReason?: PricingChangeReasonCode;
}

export class RollbackPricingPolicyVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class VersionActionDto {
  @IsOptional()
  @IsEnum(PricingChangeReasonCode)
  changeReason?: PricingChangeReasonCode;

  @ValidateIf((dto: VersionActionDto) => dto.changeReason === PricingChangeReasonCode.OTHER)
  @IsString()
  @MinLength(1)
  changeReasonNote?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
