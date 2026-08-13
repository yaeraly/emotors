import { MaximumMarkupOverrideReasonCode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

export class OverrideMaximumRetailMarkupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumRetailMarkupOverridePercent!: number;

  @IsEnum(MaximumMarkupOverrideReasonCode)
  overrideReasonCode!: MaximumMarkupOverrideReasonCode;

  @ValidateIf(
    (dto: OverrideMaximumRetailMarkupDto) =>
      dto.overrideReasonCode === MaximumMarkupOverrideReasonCode.OTHER,
  )
  @IsOptional()
  overrideReasonComment?: string;
}

export class OverrideMaximumWholesaleMarkupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumWholesaleMarkupOverridePercent!: number;

  @IsEnum(MaximumMarkupOverrideReasonCode)
  overrideReasonCode!: MaximumMarkupOverrideReasonCode;

  @ValidateIf(
    (dto: OverrideMaximumWholesaleMarkupDto) =>
      dto.overrideReasonCode === MaximumMarkupOverrideReasonCode.OTHER,
  )
  @IsOptional()
  overrideReasonComment?: string;
}

export class RestoreMaximumMarkupInheritanceDto {
  @IsOptional()
  reason?: string;
}
